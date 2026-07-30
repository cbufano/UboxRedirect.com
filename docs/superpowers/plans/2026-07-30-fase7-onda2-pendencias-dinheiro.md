# Fase 7 — Onda 7.2: Pendências & Dinheiro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** O operador abre UMA tela e sabe o que fazer (Painel de Pendências); pagamentos ficam sob controle (histórico, pagamento manual não-Stripe, registro de estorno, conciliação); tarifas/taxas editáveis pela tela com simulador; multi-moeda de exibição (USD é a única moeda real; cotação diária automática só para o cliente ter noção do valor local).

**Architecture:** Uma migration (`payments` ampliada p/ manual, `refunds`, `service_fees`, `settings`, `currencies` + `exchange_rates`), aplicada pelo controlador. Services e 4 telas admin novas/evoluídas. Edge Function `refresh-exchange-rates` (Deno, frankfurter.app — sem API key) com agendamento documentado como passo manual. Convenções idênticas às ondas anteriores (anti-0-linhas, i18n 3 idiomas, testes por comportamento).

**Decisão de design (desvio consciente da spec 4.3):** em vez de coluna nova `method`, ampliamos a coluna EXISTENTE `payments.provider` (`'stripe' | 'manual_pix' | 'manual_transfer' | 'manual_other'`) — evita duas colunas sobrepostas dizendo a mesma coisa. `provider_session_id` vira nullable (pagamento manual não tem sessão; a unique `(provider, provider_session_id)` convive com nulls no Postgres).

---

## Task 1: Migration finance (CONTROLADOR)

**Files:** Create `supabase/migrations/20260731000003_finance.sql`

```sql
-- ============================================================
-- Fase 7 / Onda 7.2 — Financeiro: pagamento manual, estornos,
-- taxas de serviço, settings, multi-moeda de exibição.
-- Aplicar depois de 20260731000002_warehouse_fixes.sql.
-- ============================================================

-- 1) payments: aceitar registro manual por staff (PIX direto, transferência).
--    provider ampliado; provider_session_id nullable (manual não tem sessão —
--    a unique (provider, provider_session_id) convive com NULLs).
alter table public.payments
  drop constraint payments_provider_check;
alter table public.payments
  add constraint payments_provider_check
    check (provider in ('stripe', 'manual_pix', 'manual_transfer', 'manual_other'));
alter table public.payments
  alter column provider_session_id drop not null;
alter table public.payments
  add column registered_by uuid references public.profiles (id) on delete restrict,
  add column notes text not null default '';

-- Staff só INSERE pagamento manual (nunca 'stripe' — exclusivo do
-- service_role via webhook), já 'succeeded', em nome próprio
-- (registered_by = auth.uid()), sempre em USD.
create policy "payments_insert_staff_manual" on public.payments
  for insert to authenticated
  with check (
    private.is_staff((select auth.uid()))
    and provider in ('manual_pix', 'manual_transfer', 'manual_other')
    and status = 'succeeded'
    and registered_by = (select auth.uid())
    and provider_session_id is null
  );

-- 2) Estornos: registro/auditoria. O processamento real no Stripe é manual
--    no dashboard deles nesta fase (documentado na tela) — aqui fica a
--    trilha de decisão e conciliação. FKs com RESTRICT (padrão de retenção).
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete restrict,
  amount_usd numeric(10, 2) not null check (amount_usd > 0),
  reason text not null,
  status text not null default 'requested' check (status in ('requested', 'processed', 'failed')),
  requested_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.refunds enable row level security;
create policy "refunds_select_staff" on public.refunds
  for select to authenticated using (private.is_staff((select auth.uid())));
create policy "refunds_insert_staff" on public.refunds
  for insert to authenticated
  with check (private.is_staff((select auth.uid())) and requested_by = (select auth.uid()));
create policy "refunds_update_staff" on public.refunds
  for update to authenticated
  using (private.is_staff((select auth.uid())))
  with check (private.is_staff((select auth.uid())));

-- 3) Taxas de serviço (hoje texto fixo no i18n do site). Leitura pública
--    (o site mostra preços sem login); escrita admin.
create table public.service_fees (
  key text primary key,
  label text not null,
  amount_usd numeric(10, 2),
  percent numeric(5, 2),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  check (amount_usd is not null or percent is not null)
);
alter table public.service_fees enable row level security;
create policy "service_fees_select_public" on public.service_fees
  for select to anon, authenticated using (true);
create policy "service_fees_write_admin" on public.service_fees
  for all to authenticated
  using (private.has_role((select auth.uid()), 'admin') or private.has_role((select auth.uid()), 'super_admin'))
  with check (private.has_role((select auth.uid()), 'admin') or private.has_role((select auth.uid()), 'super_admin'));

insert into public.service_fees (key, label, amount_usd, percent) values
  ('consolidation_per_package', 'Consolidation (per package)', 2.00, null),
  ('extra_photo', 'Extra photos (each)', 0.50, null),
  ('repackaging', 'Repackaging', 3.00, null),
  ('storage_per_day', 'Storage per day beyond included period', 0.15, null),
  ('value_protection', 'Value protection (% of declared value)', null, 2.00);

-- 4) Settings chave-valor. Staff lê; admin escreve.
create table public.settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;
create policy "settings_select_staff" on public.settings
  for select to authenticated using (private.is_staff((select auth.uid())));
create policy "settings_write_admin" on public.settings
  for all to authenticated
  using (private.has_role((select auth.uid()), 'admin') or private.has_role((select auth.uid()), 'super_admin'))
  with check (private.has_role((select auth.uid()), 'admin') or private.has_role((select auth.uid()), 'super_admin'));

insert into public.settings (key, value) values
  ('free_storage_days', '30'),
  ('paid_unshipped_alert_days', '2');

-- 5) Multi-moeda de EXIBIÇÃO (USD é a única moeda real). Leitura pública;
--    escrita só service_role (Edge Function de cron) — sem policy de
--    escrita para authenticated.
create table public.currencies (
  code text primary key,
  name text not null,
  symbol text not null,
  active boolean not null default true
);
alter table public.currencies enable row level security;
create policy "currencies_select_public" on public.currencies
  for select to anon, authenticated using (true);

create table public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  currency_code text not null references public.currencies (code),
  rate_per_usd numeric(14, 6) not null check (rate_per_usd > 0),
  quoted_at date not null,
  created_at timestamptz not null default now(),
  unique (currency_code, quoted_at)
);
alter table public.exchange_rates enable row level security;
create policy "exchange_rates_select_public" on public.exchange_rates
  for select to anon, authenticated using (true);

insert into public.currencies (code, name, symbol) values
  ('USD', 'US Dollar', '$'),
  ('BRL', 'Brazilian Real', 'R$'),
  ('EUR', 'Euro', '€'),
  ('GBP', 'British Pound', '£'),
  ('MXN', 'Mexican Peso', 'MX$'),
  ('ARS', 'Argentine Peso', 'AR$');
```

- [ ] Aplicar em produção (SQL Editor) e verificar: 5 tabelas novas (`refunds`,`service_fees`,`settings`,`currencies`,`exchange_rates`), 3 colunas novas em payments, 10 policies novas, 5 seeds de service_fees, 6 currencies, 2 settings.
- [ ] Commit: `feat: finance schema — manual payments, refunds, fees, settings, display currencies (Fase 7.2)`

## Task 2: financeAdminService + settingsService + currencyService

**Files:** Create `src/services/financeAdminService.ts`(+test), `src/services/settingsService.ts`(+test), `src/services/currencyService.ts`(+test); Modify `src/services/adminService.ts`(+test)

- `financeAdminService`: `getPayments(filter?)` (join consolidations/profiles p/ contexto), `registerManualPayment({consolidationId, userId, amountUsd, provider: 'manual_pix'|'manual_transfer'|'manual_other', notes})` — INSERT payment succeeded (registered_by = uid) **e depois** update consolidação `pending`→`paid` com anti-0-linhas (se falhar o 2º passo, lançar erro explicando a inconsistência para ação manual — documentar no código); `requestRefund({paymentId, amountUsd, reason})`; `markRefundProcessed(id)` / `markRefundFailed(id)` (anti-0-linhas); `getRefunds()`.
- `adminService.getPendingActions()`: contadores + listas curtas para o painel: pacotes `received/in_review` (já existe `getOpsStats` — evoluir), consolidações `paid` sem envio há mais de `paid_unshipped_alert_days` dias, `data_requests` abertos, pacotes vivos com `received_at` além de `free_storage_days`, consolidações `shipped` sem payment `succeeded` (conciliação).
- `settingsService`: `getSettings()`, `updateSetting(key, value)` (anti-0-linhas; upsert só de chaves existentes).
- `currencyService` (client-safe, público): `getLatestRates()` (última cotação por moeda), `approximate(amountUsd, code)` helper puro testável.

## Task 3: Painel de Pendências (substitui `/admin` Overview)

**Files:** Modify `src/pages/admin/Overview.tsx`(+test), i18n

- Cartões: "A conferir (N)" → `/admin/packages`; "Pagas sem envio (N, >X dias em vermelho)" → `/admin/consolidations`; "Pedidos LGPD (N)" → `/admin/data-requests`; "Armazenagem vencendo (N)" → lista inline com link para ficha; "Conciliação (N)" → lista inline. Zero pendências = estado "tudo em dia" positivo. Mantém os contadores gerais existentes onde fizer sentido.

## Task 4: Tela Pagamentos (`/admin/payments`)

**Files:** Create `src/pages/admin/Payments.tsx`(+test); Modify routes/AdminLayout/i18n

- Lista com filtros (status, provider), colunas: data, cliente/suite, consolidação, valor, provider, status. Painel "Registrar pagamento manual": busca consolidação `pending` (por cliente/suite), valor USD, provider manual, notas → `registerManualPayment`. Estornos: botão por pagamento `succeeded` → form valor+motivo → `requestRefund`; lista de refunds com ações processado/falhou; aviso claro de que o estorno Stripe real é feito no dashboard Stripe.

## Task 5: Tarifas & taxas (`/admin/rates`)

**Files:** Create `src/pages/admin/Rates.tsx`(+test), `src/services/ratesAdminService.ts`(+test); Modify routes/AdminLayout/i18n

- CRUD `rate_tables` (RLS admin já existe da Fase 3): listar/criar/editar/remover linhas (zona, carrier, eta, base, por kg, multiplicador). CRUD `service_fees` (valor/percentual/ativo). **Simulador**: peso + dimensões + destino → usa `rateService.estimateShippingCost` real → mostra as opções como o cliente veria. Controles de escrita só admin (`useRole`).

## Task 6: Settings (`/admin/settings`) + moeda de exibição no site

**Files:** Create `src/pages/admin/Settings.tsx`(+test); Modify `src/pages/dashboard/Shipments.tsx`(+test), routes/AdminLayout/i18n

- Settings: editar `free_storage_days`/`paid_unshipped_alert_days` (admin). Status informativo: última cotação de câmbio por moeda (data) com aviso se >48h.
- Site: em `Shipments.tsx`, ao lado do custo USD, mostrar "≈ R$ 987,00" convertido pela última cotação para a moeda do país do perfil (mapa país→moeda simples: BR→BRL, US→USD, PT/ES→EUR, MX→MXN, AR→ARS, GB→GBP; fallback: sem conversão), marcado como estimativa. Sem cotação no banco → não mostra nada (nunca quebra).

## Task 7: Edge Function `refresh-exchange-rates`

**Files:** Create `supabase/functions/refresh-exchange-rates/index.ts`; Modify `supabase/config.toml`, `docs/SISTEMA-E-ROADMAP.md` (checklist manual)

- Deno: busca `https://api.frankfurter.app/latest?from=USD&to=BRL,EUR,GBP,MXN` (frankfurter não tem ARS — para ARS usar `https://open.er-api.com/v6/latest/USD` como fonte única alternativa se disponível sem chave; senão gravar só as disponíveis e logar). Upsert em `exchange_rates` (service_role) com `quoted_at = data da cotação`. Sem secret novo. Idempotente (unique currency+date). Checklist manual: `supabase functions deploy refresh-exchange-rates` + agendar no dashboard (Cron, 1×/dia). Não exige verify_jwt=false (invocação por cron autenticada) — verificar doc atual ao implementar e documentar a escolha.

## Task 8: Revisão final da onda (mesmo formato da 7.1)
