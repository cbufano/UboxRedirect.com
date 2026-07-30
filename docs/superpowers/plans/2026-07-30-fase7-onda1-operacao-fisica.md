# Fase 7 — Onda 7.1: Operação Física do Warehouse — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o galpão funcionar de verdade: recebimento com match de pré-alerta, dimensões e foto; endereçamento físico (zona-corredor-estante-nível-posição) com sugestão automática de posição livre; etiqueta QR 4×6" imprimível (Zebra); ficha do pacote (destino do QR) com histórico de movimentação; expedição de consolidações PAGAS com lista de coleta ordenada por localização.

**Architecture:** Uma migration nova (`warehouse_locations`, `package_location_history`, `packages.location_id`, funções `generate_warehouse_locations`/`next_free_location`), aplicada em produção via SQL Editor pelo controlador (não por subagente). Services novos/estendidos em `src/services/` seguindo as convenções estabelecidas (currentUserId, camelCase, `throw new Error(error.message)`, mutações críticas com `.select()` anti-0-linhas). UI evolui as telas admin existentes e adiciona 2 novas rotas. Etiqueta QR 100% client-side (lib `qrcode` + CSS `@page 4in 6in`).

**Tech Stack:** o mesmo do site (React 19, TS, Tailwind v4, react-hook-form+zod, Vitest) + dependência nova `qrcode` (e `@types/qrcode` dev).

**Decisões do usuário aplicadas:** estrutura completa de endereçamento desde o início; grade inicial pequena (1 zona `G`, 1 corredor `A`, ~10 estantes); etiqueta térmica 4×6 Zebra; tudo em USD.

---

## Task 1: Migration — warehouse + funções (EXECUTADA PELO CONTROLADOR, não por subagente)

**Files:**
- Create: `supabase/migrations/20260731000001_warehouse.sql`

- [ ] **Step 1: Escrever a migration exatamente assim**

```sql
-- ============================================================
-- Fase 7 / Onda 7.1 — Warehouse físico: localizações endereçadas
-- (zona-corredor-estante-nível-posição), vínculo pacote→posição,
-- histórico de movimentação e funções de grade/sugestão.
-- Aplicar depois de 20260730000005_profiles_staff_update_policy.sql.
-- ============================================================

-- 1) Localizações físicas. Código legível gerado: 'G-A-01-1-01'.
create table public.warehouse_locations (
  id uuid primary key default gen_random_uuid(),
  zone text not null default 'G',
  aisle text not null,
  rack text not null,
  level text not null,
  bin text not null,
  code text generated always as (zone || '-' || aisle || '-' || rack || '-' || level || '-' || bin) stored,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (zone, aisle, rack, level, bin)
);

create unique index warehouse_locations_code_idx on public.warehouse_locations (code);

alter table public.warehouse_locations enable row level security;

-- Warehouse é 100% interno: cliente não tem NENHUMA policy aqui.
-- (packages.location_id fica visível como uuid opaco para o dono do
-- pacote via o SELECT já existente de packages — inofensivo, ele não
-- consegue resolver o uuid para um código sem policy nesta tabela.)
create policy "warehouse_locations_select_staff" on public.warehouse_locations
  for select to authenticated
  using (private.is_staff((select auth.uid())));

create policy "warehouse_locations_update_staff" on public.warehouse_locations
  for update to authenticated
  using (private.is_staff((select auth.uid())))
  with check (private.is_staff((select auth.uid())));

-- INSERT direto não é liberado nem para staff: criação de posições passa
-- SEMPRE pela função generate_warehouse_locations (admin-only, abaixo),
-- garantindo grade consistente.

-- 2) Vínculo do pacote com a posição.
alter table public.packages
  add column location_id uuid references public.warehouse_locations (id);

-- 3) Trilha de movimentação (auditoria leve; moved_by com RESTRICT,
--    padrão de retenção estabelecido em payments/data_requests).
create table public.package_location_history (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages (id) on delete cascade,
  from_location_id uuid references public.warehouse_locations (id),
  to_location_id uuid references public.warehouse_locations (id),
  moved_by uuid not null references public.profiles (id) on delete restrict,
  moved_at timestamptz not null default now()
);

alter table public.package_location_history enable row level security;

create policy "package_location_history_select_staff" on public.package_location_history
  for select to authenticated
  using (private.is_staff((select auth.uid())));

-- INSERT só via trigger (abaixo) — sem policy de INSERT para authenticated.

-- 4) Trigger: toda mudança de packages.location_id grava histórico
--    automaticamente (staff não precisa lembrar; impossível esquecer).
create or replace function public.log_package_location_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.location_id is distinct from old.location_id then
    insert into public.package_location_history
      (package_id, from_location_id, to_location_id, moved_by)
    values
      (new.id, old.location_id, new.location_id, coalesce(auth.uid(), new.received_by));
  end if;
  return new;
end;
$$;

create trigger packages_log_location_change
after update on public.packages
for each row execute function public.log_package_location_change();

-- 5) Geração de grade em massa. Admin-only (decisão estrutural, não
--    operação do dia a dia). Fica em public para ser chamável via RPC,
--    com a checagem de papel DENTRO (lição da Fase 2: private schema
--    não é exposto como RPC).
create or replace function public.generate_warehouse_locations(
  _zone text,
  _aisles text[],
  _racks int,
  _levels int,
  _bins int
) returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  _aisle text;
  _count int := 0;
begin
  if not (private.has_role((select auth.uid()), 'admin')
          or private.has_role((select auth.uid()), 'super_admin')) then
    raise exception 'Only admins can generate warehouse locations';
  end if;
  if _racks < 1 or _racks > 99 or _levels < 1 or _levels > 9 or _bins < 1 or _bins > 99 then
    raise exception 'Grid out of bounds (racks 1-99, levels 1-9, bins 1-99)';
  end if;

  foreach _aisle in array _aisles loop
    insert into public.warehouse_locations (zone, aisle, rack, level, bin)
    select _zone, _aisle,
           lpad(r::text, 2, '0'), l::text, lpad(b::text, 2, '0')
    from generate_series(1, _racks) r,
         generate_series(1, _levels) l,
         generate_series(1, _bins) b
    on conflict (zone, aisle, rack, level, bin) do nothing;
    _count := _count + (_racks * _levels * _bins);
  end loop;
  return _count;
end;
$$;

revoke execute on function public.generate_warehouse_locations from public;
grant execute on function public.generate_warehouse_locations to authenticated;

-- 6) Próxima posição livre: menor code ativo sem pacote "vivo" nela.
--    Staff-only (roda no recebimento).
create or replace function public.next_free_location()
returns table (id uuid, code text)
language sql
security definer
set search_path = ''
stable
as $$
  select wl.id, wl.code
  from public.warehouse_locations wl
  where wl.active
    and private.is_staff((select auth.uid()))
    and not exists (
      select 1 from public.packages p
      where p.location_id = wl.id
        and p.status in ('received', 'in_review', 'ready', 'consolidating')
    )
  order by wl.code
  limit 1;
$$;

revoke execute on function public.next_free_location from public;
grant execute on function public.next_free_location to authenticated;

-- 7) Mapa de ocupação: uma linha por posição com o pacote vivo (se houver).
--    View com security_invoker para respeitar a RLS do caller (staff).
create or replace view public.warehouse_occupancy
with (security_invoker = true) as
select wl.id, wl.code, wl.zone, wl.aisle, wl.rack, wl.level, wl.bin, wl.active,
       p.id as package_id, p.status as package_status, s.suite_number
from public.warehouse_locations wl
left join public.packages p
  on p.location_id = wl.id
 and p.status in ('received', 'in_review', 'ready', 'consolidating')
left join public.suites s on s.user_id = p.user_id;
```

- [ ] **Step 2: Aplicar em produção via SQL Editor** (fluxo clipboard já estabelecido) e verificar:

```sql
select
  (select count(*) from pg_tables where schemaname='public' and tablename in ('warehouse_locations','package_location_history')) as new_tables,
  (select count(*) from information_schema.columns where table_name='packages' and column_name='location_id') as pkg_col,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('generate_warehouse_locations','next_free_location')) as fns;
-- Esperado: 2, 1, 2
```

- [ ] **Step 3: Commit** — `feat: warehouse schema — locations, history, grid generation (Fase 7.1)`

---

## Task 2: warehouseService + extensões do adminService

**Files:**
- Create: `src/services/warehouseService.ts`, `src/services/warehouseService.test.ts`
- Modify: `src/services/adminService.ts`, `src/services/adminService.test.ts`

- [ ] **Step 1: `warehouseService`** com (mocks Jest/Vitest seguindo `adminService.test.ts`):

```ts
export interface WarehouseLocation { id: string; code: string; zone: string; aisle: string; rack: string; level: string; bin: string; active: boolean }
export interface OccupancySlot extends WarehouseLocation { packageId: string | null; packageStatus: string | null; suiteNumber: string | null }

warehouseService = {
  generateGrid(zone, aisles: string[], racks, levels, bins): Promise<number>   // rpc generate_warehouse_locations
  nextFreeLocation(): Promise<{ id: string; code: string } | null>             // rpc next_free_location
  getOccupancy(): Promise<OccupancySlot[]>                                     // select warehouse_occupancy order by code
  setLocationActive(id, active): Promise<void>                                 // update com .select() anti-0-linhas
  movePackage(packageId, toLocationId): Promise<void>                          // update packages set location_id — com .select()
}
```

- [ ] **Step 2: adminService — evoluções:**
  - `getPendingPreAlerts(userId): Promise<ExpectedPackage[]>` — pré-alertas `status='pending'` do cliente (para o match no recebimento)
  - `receivePackage(input)` ganha campos: `expectedPackageId?: string`, `lengthCm?/widthCm?/heightCm?: number`, `declaredValueUsd?: number`, `locationId?: string` — o INSERT envia `expected_package_id` (aciona o trigger de match já existente no banco) e `location_id`; **usar `.select('id').single()`** e retornar o id (a UI precisa dele para a etiqueta)
  - `uploadPackagePhoto(packageId, file): Promise<void>` — upload para o bucket `package-photos` no caminho `{package_id}/{filename}` + INSERT em `package_photos`
  - `getPackageDetail(id): Promise<PackageDetail>` — pacote + fotos (signed URLs) + histórico de localização (join `package_location_history` com códigos)
  - `getPaidConsolidations(): Promise<PaidConsolidation[]>` — **substitui a fila de `pending`** por `status='paid'` (agora que pagamento existe, expedição só embala o que foi pago), incluindo itens com `packages (id, store, description, weight_kg, location_id)` e código da localização
  - `markConsolidationShipped` — validar que só transiciona de `paid` (`.eq('status','paid')` + `.select()` anti-0-linhas)

- [ ] **Step 3: Testes** para todo comportamento novo (mock supabase; casos: rpc chamada com args certos, 0-linhas → throw, mapeamentos).

- [ ] **Step 4: `npx vitest run` + `tsc -b` + `oxlint` limpos. Commit.**

---

## Task 3: Recebimento v2 + etiqueta QR (PackagesQueue)

**Files:**
- Modify: `src/pages/admin/PackagesQueue.tsx` (+test)
- Create: `src/components/admin/StockLabel.tsx` (+test)
- Modify: `package.json` (deps `qrcode`, `@types/qrcode`)

- [ ] **Step 1: Fluxo de recebimento evoluído:** após o lookup por suite (existente), mostrar:
  1. Pré-alertas pendentes do cliente como cards clicáveis (loja, tracking, descrição) — clicar preenche loja/descrição/valor e guarda `expectedPackageId`; opção "sem pré-alerta" continua
  2. Campos novos no formulário: dimensões C×L×A (cm, opcionais), valor declarado (USD, opcional), foto (input file, opcional)
  3. Posição sugerida via `warehouseService.nextFreeLocation()` exibida como chip editável (dropdown com posições livres se o operador quiser trocar); aviso claro se não houver posição livre (recebe sem posição)
  4. Salvar → `receivePackage` → upload da foto se houver → abre o modal da etiqueta

- [ ] **Step 2: `StockLabel.tsx`** — componente de etiqueta 4×6":
  - QR via lib `qrcode` (`QRCode.toDataURL(url)`) apontando para `${window.location.origin}/admin/packages/${id}`
  - Layout: QR grande no topo, suite em fonte gigante, código de localização, data + peso
  - CSS de impressão: `@media print { @page { size: 4in 6in; margin: 0 } }` + esconder o resto da página; botão "Imprimir etiqueta" chama `window.print()`
  - KYC/OFAC: o painel de compliance atual do PackagesQueue **permanece** nesta onda (move para a tela de clientes só na 7.3)

- [ ] **Step 3: Testes (mock de `qrcode`), suíte completa, commit.**

---

## Task 4: Ficha do pacote (`/admin/packages/:id`)

**Files:**
- Create: `src/pages/admin/PackageDetail.tsx` (+test)
- Modify: `src/routes.tsx` (rota `/admin/packages/:id` sob StaffRoute), `src/layouts/AdminLayout.tsx` se precisar

- [ ] Conteúdo: dados do pacote + cliente/suite, fotos (signed URLs), status com ações permitidas (in_review→ready/discarded), **posição atual + botão "Mover"** (dropdown de posições livres → `warehouseService.movePackage`), histórico de movimentação (tabela from→to, quem, quando), botão "Reimprimir etiqueta" (reusa `StockLabel`).
- [ ] Estados loading/erro padrão; testes; commit.

---

## Task 5: Tela Warehouse (`/admin/warehouse`)

**Files:**
- Create: `src/pages/admin/Warehouse.tsx` (+test)
- Modify: `src/routes.tsx`, `src/layouts/AdminLayout.tsx` (nav "Warehouse")

- [ ] **Gerador de grade:** formulário zona (default `G`), corredores (texto "A" ou "A,B"), estantes/níveis/posições (números) → `generateGrid` → mensagem "N posições criadas". Só renderiza os controles de geração para admin (`useRole` já existe); ops vê só o mapa.
- [ ] **Mapa de ocupação:** grid agrupado por corredor→estante, células = posições coloridas (verde livre / âmbar ocupada / cinza inativa), tooltip/click mostra código + suite do pacote (link para a ficha). Botão ativar/desativar posição (admin).
- [ ] Testes; commit.

---

## Task 6: Expedição v2 (ConsolidationsQueue)

**Files:**
- Modify: `src/pages/admin/ConsolidationsQueue.tsx` (+test)

- [ ] Fila passa a listar **pagas** (`getPaidConsolidations`) — título/i18n ajustados ("Paid — ready to pack").
- [ ] Cada consolidação expande a **lista de coleta**: itens ordenados por código de localização (`A-01-1-01` primeiro), cada um com store/descrição/peso/**código da posição**.
- [ ] **Conferência de coleta:** campo de texto "scan/digite o id ou código" — o operador escaneia o QR (o scanner Zebra/celular digita a URL; extrair o uuid do final) ou marca checkbox manual; item conferido fica verde. Botão "Marcar como enviado" só habilita com todos conferidos (ou override explícito "enviar sem conferir" com aviso).
- [ ] Form de envio existente (peso final, tracking) permanece; `markConsolidationShipped` agora exige `paid`.
- [ ] i18n en/pt/es das strings novas (todas as telas das Tasks 3-6). Testes; commit.

---

## Task 7: Revisão final da onda

- [ ] Dispatch de revisor combinado (spec compliance + segurança) sobre o diff completo da onda, com atenção a: RLS das tabelas novas de fato aplicada em produção; funções com checagem de papel DENTRO; `.select()` anti-0-linhas em toda mutação staff; nenhuma policy de INSERT em history/locations para authenticated; view com `security_invoker`.
- [ ] Corrigir achados Críticos/Importantes; suíte completa; commit final; atualizar `docs/SISTEMA-E-ROADMAP.md` (banner Onda 7.1).
