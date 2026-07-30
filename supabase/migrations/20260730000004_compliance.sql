-- ============================================================
-- Fase 5 — Compliance: LGPD/GDPR self-service, log de itens proibidos,
-- status de KYC/OFAC. Aplicar depois de 20260730000003_payments.sql.
--
-- Fora do escopo desta migration (documentado, não implementado): triagem
-- automática contra listas OFAC/SDN e verificação de identidade via Stripe
-- Identity exigem contrato com fornecedor terceiro e credenciais reais que
-- não existem neste ambiente. Em vez de simular isso, esta migration cria
-- os CAMPOS de status (kyc_status, ofac_screening_status) que um staff
-- humano marca manualmente pelo painel admin por enquanto — a integração
-- automática fica documentada como pendência real no roadmap, não fingida
-- aqui.
-- ============================================================

-- 1) Status de compliance por cliente. Default 'not_started' — nem todo
--    cliente precisa passar por isso (ex.: KYC só exigido acima de um valor
--    declarado, política de negócio a definir).
alter table public.profiles
  add column kyc_status text not null default 'not_started'
    check (kyc_status in ('not_started', 'pending', 'verified', 'rejected')),
  add column ofac_screening_status text not null default 'not_started'
    check (ofac_screening_status in ('not_started', 'clear', 'flagged'));

-- Staff (via painel admin, role authenticated) OU service_role (uma futura
-- integração automática de KYC/OFAC rodando como Edge Function) podem
-- escrever esses dois campos; qualquer outro caller tem o valor revertido.
-- O GRANT abaixo é obrigatório para o caminho "staff logado" funcionar:
-- staff usa o MESMO role de banco `authenticated` que o cliente (mesmo
-- raciocínio de protect_consolidation_staff_columns em
-- 20260730000001_packages_consolidation.sql), então sem o GRANT explícito
-- nem staff conseguiria fazer o UPDATE chegar a rodar o trigger — o
-- Postgres barra a coluna na camada de permissão antes disso.
-- auth.role() = 'service_role' cobre o mesmo caso que já apareceu em
-- 20260730000003_payments.sql: nesse contexto auth.uid() vem null, e
-- is_staff(null) é sempre false — sem essa cláusula o trigger desfaria
-- silenciosamente a própria escrita de uma futura Edge Function de KYC.
create or replace function public.protect_profile_compliance_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.is_staff(auth.uid()) or auth.role() = 'service_role') then
    new.kyc_status = old.kyc_status;
    new.ofac_screening_status = old.ofac_screening_status;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_compliance_columns
before update on public.profiles
for each row execute function public.protect_profile_compliance_columns();

grant update (kyc_status, ofac_screening_status) on public.profiles to authenticated;

-- 2) Pedidos de exportação/exclusão de dados (LGPD art. 18 / GDPR art.
--    15-17). O cliente registra o pedido; staff processa e marca concluído.
--    NÃO apaga nada automaticamente — a exclusão de fato é um processo
--    manual/anonimização cuidadosa (ver nota em 20260730000003_payments.sql
--    sobre não poder apagar registros financeiros), não um DELETE direto.
--
-- user_id usa ON DELETE RESTRICT (não CASCADE): este registro É a prova de
-- que a empresa recebeu e atendeu um pedido LGPD/GDPR — apagá-lo junto com
-- a conta do cliente destruiria exatamente a evidência de compliance que
-- ele deveria comprovar. Mesmo raciocínio já aplicado a payments.user_id em
-- 20260730000003_payments.sql.
--
-- request_note (preenchido pelo cliente no INSERT) e resolution_notes
-- (só staff escreve) são campos separados de propósito — um texto único
-- editável por ambos os lados criaria ambiguidade de autoria num registro
-- de auditoria (ex.: cliente escrevendo algo que pareça uma nota interna de
-- staff).
create table public.data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  kind text not null check (kind in ('export', 'delete')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'rejected')),
  request_note text not null default '',
  resolution_notes text not null default '',
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.data_requests enable row level security;

-- Dono cria e lê os próprios pedidos; staff lê e processa (UPDATE) tudo.
-- Cliente não pode alterar status/completed_at/resolution_notes do próprio
-- pedido depois de criado — só cancelar não existe como conceito aqui
-- (contate o suporte), então nem UPDATE de dono é liberado.
create policy "data_requests_select_own_or_staff" on public.data_requests
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_staff((select auth.uid())));

create policy "data_requests_insert_own" on public.data_requests
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and completed_at is null
    and resolution_notes = ''
  );

create policy "data_requests_update_staff" on public.data_requests
  for update to authenticated
  using (private.is_staff((select auth.uid())))
  with check (private.is_staff((select auth.uid())));

-- 3) Log de itens proibidos encontrados na inspeção do galpão (baterias
--    soltas, itens de exportação controlada, etc.) — exigência de
--    compliance de exportação dos EUA. Só staff cria; cliente vê os
--    registros ligados aos PRÓPRIOS pacotes (transparência), nunca os de
--    terceiros.
--
-- flagged_by usa ON DELETE RESTRICT explícito (mesmo raciocínio de
-- payments.user_id): a conta de um funcionário não pode ser apagada
-- enquanto houver histórico de compliance atribuído a ela.
create table public.prohibited_items_log (
  id uuid primary key default gen_random_uuid(),
  package_id uuid references public.packages (id) on delete set null,
  flagged_by uuid not null references public.profiles (id) on delete restrict,
  item_description text not null,
  reason text not null,
  action text not null check (action in ('rejected', 'disposed', 'returned_to_sender', 'held')),
  created_at timestamptz not null default now()
);

alter table public.prohibited_items_log enable row level security;

create policy "prohibited_items_select_own_package_or_staff" on public.prohibited_items_log
  for select to authenticated
  using (
    private.is_staff((select auth.uid()))
    or exists (
      select 1 from public.packages pkg
      where pkg.id = prohibited_items_log.package_id and pkg.user_id = (select auth.uid())
    )
  );

create policy "prohibited_items_insert_staff" on public.prohibited_items_log
  for insert to authenticated
  with check (private.is_staff((select auth.uid())));
