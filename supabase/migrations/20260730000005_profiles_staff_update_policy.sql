-- ============================================================
-- Fix — Achado Crítico da revisão de segurança da Fase 5 (compliance).
-- Aplicar depois de 20260730000004_compliance.sql.
--
-- setKycStatus/setOfacStatus (adminService.ts) fazem
-- `update(...).eq('id', <id do cliente>)` logados como staff — mas a
-- única policy de UPDATE em profiles até agora, `profiles_update_own`
-- (20260729000001), só permite `id = auth.uid()`. Como staff nunca é o
-- dono da linha do cliente, a cláusula `using` filtra a linha ANTES do
-- trigger protect_profile_compliance_columns rodar: o UPDATE afeta 0
-- linhas, sem erro (supabase-js não reporta isso por padrão), e a UI
-- otimista de PackagesQueue.tsx mostrava "sucesso" mesmo sem gravar
-- nada — silenciosamente inoperante em produção.
--
-- Todas as outras tabelas onde staff escreve linha de terceiro já têm
-- esse alcance (expected_packages_update_own_or_staff,
-- packages_update_staff, consolidations_update_own_pending_or_staff,
-- data_requests_update_staff em 20260730000004) — profiles ficou de
-- fora por descuido quando os campos de compliance foram adicionados.
--
-- O trigger protect_profile_compliance_columns + o GRANT de coluna
-- (kyc_status, ofac_screening_status) continuam sendo a defesa que
-- impede staff de alterar name/country de terceiros por essa mesma
-- policy, e impede cliente de alterar as colunas de compliance da
-- própria linha — esta policy só resolve o alcance de LINHA que
-- faltava, não substitui a proteção de coluna já existente.
drop policy "profiles_update_own" on public.profiles;

create policy "profiles_update_own_or_staff" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or private.is_staff((select auth.uid())))
  with check (id = (select auth.uid()) or private.is_staff((select auth.uid())));
