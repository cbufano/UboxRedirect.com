-- ============================================================
-- Fase 7 / Onda 7.4 — Automação: outbox de e-mails (via triggers) e
-- eventos de rastreio (webhook genérico + linha do tempo do cliente).
-- Aplicar depois de 20260731000006_people_audit_hardening.sql.
-- ============================================================

-- 1) Outbox. user_id RESTRICT (retenção: o registro do que foi/deveria
--    ter sido comunicado é trilha de compliance).
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  template text not null check (template in
    ('package_received', 'package_ready', 'payment_confirmed', 'shipped', 'storage_warning')),
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  error text not null default '',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.email_outbox enable row level security;

-- Staff lê (painel); NINGUÉM em authenticated escreve — triggers inserem
-- como owner e a função de envio (service_role) atualiza status.
create policy "email_outbox_select_staff" on public.email_outbox
  for select to authenticated
  using (private.is_staff((select auth.uid())));

-- 2) Triggers de outbox (eventos; storage_warning é temporal e fica na
--    Edge Function send-emails).
create or replace function public.enqueue_email(
) returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'packages' and tg_op = 'INSERT' then
    insert into public.email_outbox (user_id, template, payload)
    values (new.user_id, 'package_received',
      jsonb_build_object('store', new.store, 'weight_kg', new.weight_kg, 'package_id', new.id));
  elsif tg_table_name = 'packages' and tg_op = 'UPDATE'
        and new.status = 'ready' and old.status is distinct from new.status then
    insert into public.email_outbox (user_id, template, payload)
    values (new.user_id, 'package_ready',
      jsonb_build_object('store', new.store, 'package_id', new.id));
  elsif tg_table_name = 'payments' and tg_op = 'INSERT' and new.status = 'succeeded' then
    insert into public.email_outbox (user_id, template, payload)
    values (new.user_id, 'payment_confirmed',
      jsonb_build_object('amount_usd', new.amount_usd, 'provider', new.provider,
                         'consolidation_id', new.consolidation_id));
  elsif tg_table_name = 'payments' and tg_op = 'UPDATE'
        and new.status = 'succeeded' and old.status is distinct from new.status then
    -- Stripe: a linha nasce 'pending' e o webhook a promove a 'succeeded'.
    insert into public.email_outbox (user_id, template, payload)
    values (new.user_id, 'payment_confirmed',
      jsonb_build_object('amount_usd', new.amount_usd, 'provider', new.provider,
                         'consolidation_id', new.consolidation_id));
  elsif tg_table_name = 'consolidations' and tg_op = 'UPDATE'
        and new.status = 'shipped' and old.status is distinct from new.status then
    insert into public.email_outbox (user_id, template, payload)
    values (new.user_id, 'shipped',
      jsonb_build_object('carrier', new.carrier, 'tracking_code', new.tracking_code,
                         'consolidation_id', new.id));
  end if;
  return new;
end; $$;

create trigger packages_enqueue_email after insert or update on public.packages
for each row execute function public.enqueue_email();
create trigger payments_enqueue_email after insert or update on public.payments
for each row execute function public.enqueue_email();
create trigger consolidations_enqueue_email after update on public.consolidations
for each row execute function public.enqueue_email();

-- 3) Eventos de rastreio. Escrita só service_role (webhook/poll);
--    cliente lê os eventos das PRÓPRIAS consolidações (linha do tempo);
--    staff lê tudo.
create table public.tracking_events (
  id uuid primary key default gen_random_uuid(),
  consolidation_id uuid not null references public.consolidations (id) on delete cascade,
  source text not null,
  raw_status text not null,
  normalized_status text not null check (normalized_status in
    ('in_transit', 'customs', 'out_for_delivery', 'delivered', 'exception')),
  occurred_at timestamptz not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.tracking_events enable row level security;

create policy "tracking_events_select_own_or_staff" on public.tracking_events
  for select to authenticated
  using (
    private.is_staff((select auth.uid()))
    or exists (
      select 1 from public.consolidations c
      where c.id = tracking_events.consolidation_id
        and c.user_id = (select auth.uid())
    )
  );

-- 4) Entrega automática: evento delivered move a consolidação
--    shipped→delivered. service_role escreve consolidations livremente
--    (protect_consolidation_staff_columns já libera), e o UPDATE via
--    trigger roda como owner. Idempotente (status guard).
create or replace function public.apply_tracking_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.normalized_status = 'delivered' then
    update public.consolidations
    set status = 'delivered'
    where id = new.consolidation_id and status = 'shipped';
  end if;
  return new;
end; $$;

create trigger tracking_events_apply after insert on public.tracking_events
for each row execute function public.apply_tracking_event();
