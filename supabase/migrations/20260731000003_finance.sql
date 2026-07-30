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
