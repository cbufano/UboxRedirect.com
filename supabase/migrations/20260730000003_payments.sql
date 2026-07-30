-- ============================================================
-- Fase 4 — Pagamentos (Stripe). Aplicar DEPOIS de
-- 20260730000001_packages_consolidation.sql e
-- 20260730000000_widen_staff_role_check.sql.
-- ============================================================

-- 0) Correção necessária para a Fase 4: protect_consolidation_staff_columns
--    (criada em 20260730000001) checava só private.is_staff(auth.uid()).
--    A Edge Function de pagamento (Fase 4) atualiza `consolidations` usando
--    a service_role key, que não tem um usuário logado — auth.uid() vem
--    null nesse contexto, e is_staff(null) é sempre false. Sem esta
--    correção, o trigger trataria a própria Edge Function como "não-staff"
--    e desfaria (reset para o valor antigo) o que ela tentasse escrever em
--    cost_usd/paid_at/shipped_at/etc — quebrando o pagamento silenciosamente.
--    auth.role() retorna a claim `role` do JWT da requisição; para a
--    service_role key esse valor é literalmente 'service_role'.
create or replace function public.protect_consolidation_staff_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.is_staff(auth.uid()) or auth.role() = 'service_role') then
    new.carrier = old.carrier;
    new.tracking_code = old.tracking_code;
    new.chargeable_weight_kg = old.chargeable_weight_kg;
    new.cost_usd = old.cost_usd;
    new.paid_at = old.paid_at;
    new.shipped_at = old.shipped_at;
  end if;
  return new;
end;
$$;

-- 1) Registro de pagamento. Nenhuma policy de INSERT/UPDATE para
--    authenticated — só a Edge Function (service_role, ignora RLS) cria e
--    atualiza linhas aqui. O cliente só lê os próprios pagamentos.
--
-- user_id referencia profiles com ON DELETE RESTRICT (não CASCADE): um
-- registro financeiro não pode sumir junto com a conta do cliente. LGPD/GDPR
-- preveem retenção obrigatória de dados de cobrança por exigência legal
-- (auditoria fiscal, contestação de chargeback) mesmo após um pedido de
-- exclusão — a Fase 5 (compliance) deve ANONIMIZAR profiles, não apagar,
-- quando o cliente tiver histórico de pagamento; RESTRICT torna essa
-- exclusão acidental impossível em vez de silenciosa.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  consolidation_id uuid not null references public.consolidations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  provider text not null default 'stripe' check (provider in ('stripe')),
  provider_session_id text not null,
  provider_payment_intent_id text,
  amount_usd numeric(10, 2) not null check (amount_usd > 0),
  currency text not null default 'usd' check (currency = 'usd'),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_session_id)
);

-- Trava de segundo nível contra cobrança duplicada: mesmo que a Edge
-- Function tenha um bug ou o cliente abra duas sessões de checkout pro
-- mesmo pedido, o banco nunca deixa existir 2 pagamentos 'succeeded' para a
-- mesma consolidação.
create unique index payments_one_succeeded_per_consolidation
  on public.payments (consolidation_id)
  where status = 'succeeded';

create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

alter table public.payments enable row level security;

-- Dono lê os próprios pagamentos; staff lê tudo (suporte/financeiro).
-- Sem policy de insert/update/delete para authenticated — RLS bloqueia por
-- padrão; só a service_role (que ignora RLS) escreve aqui.
create policy "payments_select_own_or_staff" on public.payments
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_staff((select auth.uid())));
