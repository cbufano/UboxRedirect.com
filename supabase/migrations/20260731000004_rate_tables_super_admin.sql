-- ============================================================
-- Fase 7 / Onda 7.2 — inconsistência apontada na implementação da tela
-- de tarifas: rate_tables_write_admin (Fase 3) só reconhece 'admin',
-- enquanto todas as superfícies administrativas posteriores (settings,
-- service_fees, generate_warehouse_locations) tratam admin E super_admin
-- como equivalentes. Um super_admin tentando editar tarifas teria a
-- escrita rejeitada pela RLS mesmo com a UI liberada.
-- Aplicar depois de 20260731000003_finance.sql.
-- ============================================================

drop policy "rate_tables_write_admin" on public.rate_tables;

create policy "rate_tables_write_admin" on public.rate_tables
  for all to authenticated
  using (private.has_role((select auth.uid()), 'admin')
         or private.has_role((select auth.uid()), 'super_admin'))
  with check (private.has_role((select auth.uid()), 'admin')
              or private.has_role((select auth.uid()), 'super_admin'));
