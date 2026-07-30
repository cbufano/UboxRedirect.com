-- ============================================================
-- Fase 3 (correção) — unifica a checagem de "é da equipe" para incluir
-- ops e super_admin, não só admin.
--
-- A Fase 2 (20260729000001) só previu 'admin' nas policies de
-- profiles/suites/user_roles. A Fase 3 (20260730000001) já tratava 'ops'
-- como equipe em packages/consolidations, mas 'super_admin' também tinha
-- ficado de fora ali. Resultado: uma conta só-ops ou só-super_admin passa
-- pelo guard de UI (StaffRoute) mas cai em dados vazios/"não encontrado"
-- ao tentar ler profiles/suites — não é falha de segurança (nega por
-- padrão), mas quebra o painel para esses papéis.
--
-- Esta migration centraliza a checagem numa função private.is_staff() e
-- reaplica as 3 policies de leitura que estavam restritas só a 'admin'.
-- ============================================================

create or replace function private.is_staff(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role in ('ops', 'admin', 'super_admin')
  );
$$;

revoke execute on function private.is_staff(uuid) from public;
grant execute on function private.is_staff(uuid) to authenticated;

drop policy "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_staff" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.is_staff((select auth.uid())));

drop policy "user_roles_select_own_or_admin" on public.user_roles;
create policy "user_roles_select_own_or_staff" on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_staff((select auth.uid())));

drop policy "suites_select_own_or_admin" on public.suites;
create policy "suites_select_own_or_staff" on public.suites
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_staff((select auth.uid())));
