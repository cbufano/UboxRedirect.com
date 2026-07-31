# Fase 7 — Onda 7.3: Pessoas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Gestão de contas sem SQL manual: tela de clientes (busca, perfil completo, notas internas, suspensão, KYC/OFAC movido para cá), tela de staff (promover/rebaixar papéis com regras de segurança), e **log de auditoria imutável gravado por triggers no banco** (não por boa vontade do client). Também paga a dívida da 7.2: colunas de `refunds` congeladas após criação.

**Architecture:** Uma migration (audit_log + triggers de auditoria, proteção de colunas de refunds, `customer_notes`, `profiles.suspended_at`, RPC `set_user_role`), aplicada pelo controlador. Auditoria via **triggers** em eventos sensíveis (dinheiro, papéis, compliance, suspensão, status) — mais confiável que logging no client, que pode ser contornado via API direta. Regras de papel: ninguém muda o próprio papel; mexer em admin/super_admin exige super_admin. Modelo de papéis: todo usuário mantém a linha base `customer`; no máximo UM papel staff adicional por vez (o RPC troca).

**Decisões conscientes (desvios da spec 4.5 documentados):**
- `audit_log.actor_id` é **nullable** (spec dizia not null): escritas via service_role (webhooks/functions) não têm `auth.uid()`; melhor registrar com ator nulo ("sistema") que não registrar.
- Suspensão bloqueia no **login/boot do site** (UI) nesta onda; enforcement adicional por RLS (ex. impedir INSERTs de suspensos) fica documentado como melhoria futura — o dano possível de um suspenso logado é limitado (só age sobre os próprios dados). App mobile: dívida registrada (v2).

---

## Task 1: Migration — pessoas + auditoria (CONTROLADOR)

**Files:** Create `supabase/migrations/20260731000005_people_audit.sql`

```sql
-- ============================================================
-- Fase 7 / Onda 7.3 — Pessoas: audit_log imutável (via triggers),
-- proteção de colunas de refunds (dívida da 7.2), notas internas de
-- cliente, suspensão de conta, RPC de gestão de papéis.
-- Aplicar depois de 20260731000004_rate_tables_super_admin.sql.
-- ============================================================

-- 1) Log de auditoria imutável. actor_id nullable: escritas de
--    service_role (webhook/functions) não têm auth.uid() — registrar
--    com ator nulo ("sistema") é melhor que não registrar. RESTRICT
--    preserva a trilha se um staff sair (padrão de retenção).
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete restrict,
  action text not null,
  entity text not null,
  entity_id uuid,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

-- SELECT só admin/super_admin. NENHUMA policy de INSERT/UPDATE/DELETE
-- para authenticated: só os triggers (SECURITY DEFINER) escrevem, e
-- nem admin edita ou apaga auditoria.
create policy "audit_log_select_admin" on public.audit_log
  for select to authenticated
  using (private.has_role((select auth.uid()), 'admin')
         or private.has_role((select auth.uid()), 'super_admin'));

-- 2) Função utilitária dos triggers de auditoria.
create or replace function private.write_audit(
  _action text, _entity text, _entity_id uuid, _detail jsonb
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, entity, entity_id, detail)
  values ((select auth.uid()), _action, _entity, _entity_id, coalesce(_detail, '{}'::jsonb));
$$;

-- 3) Triggers de auditoria nos eventos sensíveis.
create or replace function public.audit_payment_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.write_audit('payment.recorded', 'payment', new.id,
    jsonb_build_object('provider', new.provider, 'amount_usd', new.amount_usd,
                       'consolidation_id', new.consolidation_id, 'status', new.status));
  return new;
end; $$;
create trigger payments_audit_insert after insert on public.payments
for each row execute function public.audit_payment_insert();

create or replace function public.audit_refund_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.write_audit('refund.requested', 'refund', new.id,
      jsonb_build_object('payment_id', new.payment_id, 'amount_usd', new.amount_usd));
  elsif new.status is distinct from old.status then
    perform private.write_audit('refund.status_changed', 'refund', new.id,
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end; $$;
create trigger refunds_audit_change after insert or update on public.refunds
for each row execute function public.audit_refund_change();

create or replace function public.audit_profile_admin_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.suspended_at is distinct from old.suspended_at then
    perform private.write_audit('customer.suspension_changed', 'profile', new.id,
      jsonb_build_object('suspended', new.suspended_at is not null));
  end if;
  if new.kyc_status is distinct from old.kyc_status
     or new.ofac_screening_status is distinct from old.ofac_screening_status then
    perform private.write_audit('compliance.status_changed', 'profile', new.id,
      jsonb_build_object('kyc', new.kyc_status, 'ofac', new.ofac_screening_status));
  end if;
  return new;
end; $$;
-- (criado DEPOIS da coluna suspended_at, abaixo)

create or replace function public.audit_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    perform private.write_audit(tg_argv[0] || '.status_changed', tg_argv[0], new.id,
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end; $$;
create trigger packages_audit_status after update on public.packages
for each row execute function public.audit_status_change('package');
create trigger consolidations_audit_status after update on public.consolidations
for each row execute function public.audit_status_change('consolidation');

-- 4) Dívida da 7.2: refunds com colunas congeladas após criação
--    (amount_usd/reason/payment_id imutáveis; só status/processed_at mudam).
create or replace function public.protect_refund_columns()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.amount_usd is distinct from old.amount_usd
     or new.reason is distinct from old.reason
     or new.payment_id is distinct from old.payment_id
     or new.requested_by is distinct from old.requested_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Refund core fields are immutable after creation';
  end if;
  return new;
end; $$;
create trigger refunds_protect_columns before update on public.refunds
for each row execute function public.protect_refund_columns();

-- 5) Notas internas de cliente. Cliente NUNCA vê (sem policy de select
--    para dono). RESTRICT nas FKs (retenção).
create table public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  author_id uuid not null references public.profiles (id) on delete restrict,
  note text not null,
  created_at timestamptz not null default now()
);
alter table public.customer_notes enable row level security;
create policy "customer_notes_select_staff" on public.customer_notes
  for select to authenticated using (private.is_staff((select auth.uid())));
create policy "customer_notes_insert_staff" on public.customer_notes
  for insert to authenticated
  with check (private.is_staff((select auth.uid())) and author_id = (select auth.uid()));

-- 6) Suspensão de conta. Mesmo padrão de proteção de coluna do KYC:
--    GRANT explícito + trigger que só aceita staff/service_role.
alter table public.profiles add column suspended_at timestamptz;
grant update (suspended_at) on public.profiles to authenticated;

create or replace function public.protect_profile_suspension()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.suspended_at is distinct from old.suspended_at
     and not (private.is_staff(auth.uid()) or auth.role() = 'service_role') then
    new.suspended_at = old.suspended_at;
  end if;
  return new;
end; $$;
create trigger profiles_protect_suspension before update on public.profiles
for each row execute function public.protect_profile_suspension();

create trigger profiles_audit_admin_change after update on public.profiles
for each row execute function public.audit_profile_admin_change();

-- 7) RPC de gestão de papéis. Regras: só admin/super_admin chamam;
--    ninguém muda o próprio papel; envolver admin/super_admin (papel
--    atual OU novo) exige super_admin. Modelo: linha base 'customer'
--    sempre preservada + no máximo UM papel staff por usuário.
create or replace function public.set_user_role(_target uuid, _new_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _caller uuid := (select auth.uid());
  _caller_is_super boolean := private.has_role((select auth.uid()), 'super_admin');
  _target_has_admin boolean;
begin
  if not (private.has_role(_caller, 'admin') or _caller_is_super) then
    raise exception 'Only admins can manage roles';
  end if;
  if _target = _caller then
    raise exception 'You cannot change your own role';
  end if;
  select exists (
    select 1 from public.user_roles
    where user_id = _target and role in ('admin', 'super_admin')
  ) into _target_has_admin;
  if (_target_has_admin or _new_role in ('admin', 'super_admin')) and not _caller_is_super then
    raise exception 'Only a super admin can grant or revoke admin roles';
  end if;

  -- Garante a base 'customer' e remove qualquer papel staff atual.
  insert into public.user_roles (user_id, role) values (_target, 'customer')
  on conflict (user_id, role) do nothing;
  delete from public.user_roles where user_id = _target and role <> 'customer';
  if _new_role <> 'customer' then
    insert into public.user_roles (user_id, role) values (_target, _new_role)
    on conflict (user_id, role) do nothing;
  end if;

  perform private.write_audit('role.changed', 'user', _target,
    jsonb_build_object('new_role', _new_role));
end;
$$;

revoke execute on function public.set_user_role from public;
grant execute on function public.set_user_role to authenticated;
```

- [ ] Aplicar em produção e verificar: 2 tabelas novas, coluna `profiles.suspended_at`, 8 triggers novos (payments/refunds×1/profiles×2/packages/consolidations/refunds_protect), funções `private.write_audit` + `public.set_user_role`, 3 policies novas (audit_log 1, customer_notes 2).
- [ ] Commit: `feat: people & audit schema — immutable audit log, notes, suspension, role RPC (Fase 7.3)`

## Task 2: peopleAdminService + extensões

**Files:** Create `src/services/peopleAdminService.ts`(+test); Modify `src/services/adminService.ts` se necessário

- `searchCustomers(query)`: profiles com `or(name.ilike.%q%,email.ilike.%q%)` OU suite exata via `suites` (se o formato casa com `BUF-...`, buscar por suite primeiro); retorna id, nome, email, suite, país, suspended, kyc/ofac.
- `getCustomerProfile(userId)`: perfil + suite + contadores/listas curtas (pacotes vivos, consolidações, pagamentos, data_requests do usuário — queries diretas staff via RLS) + notas.
- `addCustomerNote(userId, note)` (author_id = uid), `getCustomerNotes(userId)`.
- `setSuspended(userId, suspended: boolean)`: update `suspended_at = now()|null` com anti-0-linhas.
- `listUsersWithRoles()`: user_roles + profiles (nome/email), agregado por usuário (base customer + papel staff se houver).
- `setUserRole(userId, role)`: `rpc('set_user_role', { _target, _new_role })`.
- `getAuditLog(limit=100)`: audit_log desc com nome do ator (embed profiles; ator nulo → "system").

## Task 3: Tela Clientes (`/admin/customers` + `/admin/customers/:id`)

**Files:** Create `src/pages/admin/Customers.tsx`, `src/pages/admin/CustomerDetail.tsx` (+tests); Modify `src/pages/admin/PackagesQueue.tsx` (REMOVER o painel KYC/OFAC — agora vive no perfil do cliente; manter um link "ver cliente" no card do lookup), routes/AdminLayout/i18n

- Customers: busca (nome/e-mail/suite) → resultados → link para o detalhe.
- CustomerDetail: dados + suite + badges suspenso/KYC/OFAC; controles KYC/OFAC (movidos do PackagesQueue — mesmos selects/`setKycStatus`/`setOfacStatus`); suspender/reativar com confirmação inline; notas internas (lista + adicionar); resumos (pacotes vivos com link para ficha, consolidações, pagamentos, pedidos LGPD).

## Task 4: Tela Staff (`/admin/staff`) + suspensão no login do site

**Files:** Create `src/pages/admin/Staff.tsx`(+test); Modify `src/contexts/AuthContext.tsx` ou `src/components/ProtectedRoute.tsx` (+tests), `src/services/profileService.ts` (expor suspended), routes/AdminLayout/i18n

- Staff: lista usuários com papéis (badge por papel), busca client-side, mudar papel via dropdown → `setUserRole` (erros do RPC — próprio papel, sem permissão — mostrados com mensagem própria); só admin/super_admin veem a tela ÚTIL (gate useRole; RPC valida de verdade). Card "Audit log" (admin): tabela dos últimos 100 eventos (quando, quem, ação, entidade, detalhe resumido).
- Suspensão no site: `profileService.getMyProfile` passa a expor `suspendedAt`; `ProtectedRoute` (ou DashboardLayout) checa e, se suspenso, mostra tela "conta suspensa — contate o suporte" + botão sair (sem acesso ao painel). Teste cobrindo o bloqueio.

## Task 5: Revisão final da onda (mesmo formato; foco: imutabilidade do audit_log, regras do set_user_role — escalada de privilégio, auto-promoção —, RLS de customer_notes nunca visível ao cliente, trigger de suspensão)
