# Fase 7 — Onda 7.4: Automação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** O "funcionário invisível": todo evento relevante do ciclo de vida gera automaticamente um e-mail na fila (outbox) — pacote recebido, pronto, pago, enviado, armazenagem vencendo — e o rastreamento externo entra pelo webhook genérico (`tracking_events`), marcando entrega sozinho e jogando exceções no Painel de Pendências. Cliente ganha a linha do tempo de rastreio na tela de envios.

**Architecture:** Outbox gravado por **triggers do banco** (mesma filosofia do audit_log da 7.3 — client não pode esquecer). Edge Function `send-emails` (cron) processa `pending`: com `RESEND_API_KEY` envia via Resend; sem, marca `skipped` (nada se perde silenciosamente — visível no admin). `storage_warning` é gerado pela própria função (não por trigger — é temporal, não evento). Edge Function `tracking-webhook` (verify_jwt=false + secret próprio no header) grava eventos; trigger no INSERT: `delivered` → consolidação `shipped`→`delivered`; `exception` → aparece no Painel de Pendências (query). RLS: cliente lê eventos das PRÓPRIAS consolidações (linha do tempo).

**Fora de escopo:** provedor de e-mail real (Resend exige conta/chave do usuário — checklist manual); agregador de rastreio real (idem); e-mails no app mobile.

---

## Task 1: Migration — outbox + tracking (CONTROLADOR)

**Files:** Create `supabase/migrations/20260731000007_automation.sql`

```sql
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
```

- [ ] Aplicar em produção; verificar: 2 tabelas, 4 triggers novos (`packages_enqueue_email`, `payments_enqueue_email`, `consolidations_enqueue_email`, `tracking_events_apply`), 2 policies.
- [ ] Commit: `feat: automation schema — email outbox via triggers, tracking events (Fase 7.4)`

## Task 2: Edge Functions `send-emails` + `tracking-webhook` (CONTROLADOR — segue o padrão stripe/exchange)

**Files:** Create `supabase/functions/send-emails/index.ts`, `supabase/functions/tracking-webhook/index.ts`; Modify `supabase/config.toml` (verify_jwt=false SÓ para tracking-webhook, com comentário), `docs/SISTEMA-E-ROADMAP.md` (checklist: deploy das 2 functions, cron do send-emails, secrets `RESEND_API_KEY` opcional + `TRACKING_WEBHOOK_SECRET` obrigatório para o webhook, e configuração do fornecedor de rastreio apontando para a URL)

- `send-emails`: (cron) 1. gera `storage_warning` para pacotes vivos com `received_at` além de `free_storage_days` (setting) e SEM warning nos últimos 7 dias (dedup por user+package no payload); 2. processa até 50 `pending`: com `RESEND_API_KEY` → POST api.resend.com (from configurável via setting `email_from`, fallback 'onboarding@resend.dev'; assunto/corpo por template, en simples) → `sent`/`failed`+error; sem chave → `skipped` com error explicativo. Busca o e-mail do destinatário em `profiles`.
- `tracking-webhook`: POST com header `x-webhook-secret` == `TRACKING_WEBHOOK_SECRET` (sem secret configurado → 503, nunca aceita); body `{ tracking_code, status, occurred_at?, raw? }`; resolve a consolidação por `tracking_code` (não expõe ids internos ao fornecedor); mapa de normalização (delivered/customs/out_for_delivery/in_transit/exception + sinônimos comuns); insere `tracking_events` (o trigger faz o resto); desconhecido → grava como `exception` com raw. 200 sempre que gravou; 404 se tracking_code não existe.

## Task 3: Services + Painel de Pendências + linha do tempo

**Files:** Modify `src/services/adminService.ts`(+test) — `getPendingActions` ganha `trackingExceptions` (eventos exception das últimas 2 semanas com consolidação, cidade) e `failedEmails` (outbox failed count); Create `src/services/trackingService.ts`(+test) — `getTrackingEvents(consolidationId)` (cliente, RLS filtra); Modify `src/services/financeAdminService.ts` OU novo `outboxAdminService` — `getOutbox(statusFilter?)` (staff, com template/status/erro/data, limite 100).

## Task 4: UI — pendências, outbox no admin, linha do tempo no cliente

**Files:** Modify `src/pages/admin/Overview.tsx`(+test) — 2 cartões novos (exceções de rastreio → lista inline com link para consolidação; e-mails falhados → contador com link para Settings); Modify `src/pages/admin/Settings.tsx`(+test) — card "E-mail outbox" (lista com filtro por status, ícone por status, erro visível, aviso quando há `skipped` = chave não configurada); Modify `src/pages/dashboard/Shipments.tsx`(+test) — para consolidações `shipped`/`delivered`, seção expansível "Rastreamento" com a linha do tempo (`trackingService`, ordenada desc: data, status traduzido, badge de cor; `exception` em vermelho; vazio = "sem eventos ainda"). i18n en/pt/es de tudo.

## Task 5: Revisão final da onda + fechamento da FASE 7

- Revisor: foco em (a) triggers de outbox não abortarem operações (falha de insert → aborta? aceitável fail-closed? avaliar), (b) webhook: autenticação por secret, resolução por tracking_code sem vazar dados, normalização, (c) RLS de tracking_events (cliente só vê o próprio), (d) send-emails: nunca envia 2× (transição de status atômica?), skipped visível.
- Após correções: atualizar roadmap (banner 7.4 + fase 7 completa), rodar suíte completa site+mobile, merge `feat/fase7-back-office` → `master` + push.
