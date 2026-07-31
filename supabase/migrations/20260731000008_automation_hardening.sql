-- ============================================================
-- Fase 7 / Onda 7.4 — Hardening da automação (achados da revisão final).
-- Aplicar depois de 20260731000007_automation.sql.
--
-- C1: claim atômica no send-emails exige um estado intermediário
--     'sending' + claimed_at (a função reivindica a linha ANTES de
--     chamar a Resend; linhas presas em 'sending' > 10 min voltam a
--     'pending' na execução seguinte).
-- I1: cancelar consolidação devolvia pacotes a 'ready' e reenviava o
--     e-mail "package_ready" — o branch agora só dispara na PRIMEIRA
--     passagem para ready (vindo de received/in_review).
-- I2: tracking_code sem unicidade derrubava o tracking-webhook com 500
--     permanente (maybeSingle com 2 linhas) — índice único parcial.
-- Menores: índices de acesso do outbox e da linha do tempo.
-- ============================================================

-- 1) C1 — estado 'sending' + claimed_at para claim atômica.
alter table public.email_outbox drop constraint email_outbox_status_check;
alter table public.email_outbox add constraint email_outbox_status_check
  check (status in ('pending', 'sending', 'sent', 'failed', 'skipped'));
alter table public.email_outbox add column claimed_at timestamptz;

-- 2) I1 — package_ready só na primeira transição real para ready.
--    Demais branches inalterados (redefinição completa da função).
create or replace function public.enqueue_email(
) returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'packages' and tg_op = 'INSERT' then
    insert into public.email_outbox (user_id, template, payload)
    values (new.user_id, 'package_received',
      jsonb_build_object('store', new.store, 'weight_kg', new.weight_kg, 'package_id', new.id));
  elsif tg_table_name = 'packages' and tg_op = 'UPDATE'
        and new.status = 'ready' and old.status in ('received', 'in_review') then
    -- Só o fluxo de revisão gera o e-mail; consolidating -> ready
    -- (cancelamento de consolidação) NÃO reenvia "passed review".
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

-- 3) I2 — um tracking_code aponta para NO MÁXIMO uma consolidação.
--    Também protege o staff de digitar o mesmo código duas vezes.
create unique index consolidations_tracking_code_unique
  on public.consolidations (tracking_code)
  where tracking_code is not null;

-- 4) Índices de acesso (fila do send-emails; linha do tempo + RLS;
--    painel de pendências por status/data).
create index email_outbox_status_created_idx
  on public.email_outbox (status, created_at);
create index tracking_events_consolidation_idx
  on public.tracking_events (consolidation_id, occurred_at desc);
create index tracking_events_status_occurred_idx
  on public.tracking_events (normalized_status, occurred_at desc);
