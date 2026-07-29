-- ============================================================
-- Fase 2 — Fundação de auth: perfis, papéis, suites, consentimentos
-- Aplicar no SQL Editor do Supabase (ou via supabase db push).
-- ============================================================

-- 0) Schema privado — nunca exposto pelo PostgREST (só o schema `public` é
--    exposto por padrão no Supabase). Funções de checagem de papel moram
--    aqui para não virarem endpoints RPC chamáveis por qualquer cliente.
create schema if not exists private;

-- 1) Enum de papéis
create type public.app_role as enum ('customer', 'ops', 'support', 'admin', 'super_admin');

-- 2) Papéis por usuário — NUNCA em metadata editável pelo cliente
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

-- 3) Checagem de papel. Vive em `private` (não em `public`) para que o
--    PostgREST nunca a exponha como RPC — chamada direta revelaria o papel
--    de qualquer user_id para qualquer chamador. SECURITY DEFINER evita
--    recursão de RLS ao ser usada dentro das próprias policies.
create or replace function private.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

-- Só `authenticated` pode chamar (as próprias policies rodam como o role
-- autenticado). `anon` e `public` nunca recebem EXECUTE.
revoke execute on function private.has_role(uuid, public.app_role) from public;
grant usage on schema private to authenticated;
grant execute on function private.has_role(uuid, public.app_role) to authenticated;

-- Atribuição de papéis (ex.: promover alguém a admin) é feita apenas via
-- SQL direto/service_role por enquanto — não há UI nem RPC para isso ainda.
-- Quando o painel admin existir (Fase 3+), adicionar uma função
-- SECURITY DEFINER dedicada e auditada para isso, gated por
-- private.has_role(auth.uid(), 'admin'); nunca abrir INSERT/UPDATE direto
-- em user_roles para clientes.

-- 4) Perfis (1:1 com auth.users)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text not null default '',
  country text not null default '',
  preferred_language text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5) Suites — o endereço pessoal do cliente no galpão
create sequence public.suite_number_seq start with 10001;

-- FK aponta para public.profiles (não auth.users) de propósito: profiles.id
-- já referencia auth.users(id) 1:1, e apontar suites.user_id para profiles
-- dá ao PostgREST uma relação direta entre as duas tabelas — sem isso, um
-- select com embedding (`profiles ... suites (suite_number)`) falha com
-- PGRST200 "could not find a relationship", já que o PostgREST não infere
-- relações através de uma terceira tabela em comum (auth.users). A ordem de
-- inserção do trigger handle_new_user (profiles antes de suites) garante
-- que a FK nunca falha no cadastro.
create table public.suites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  suite_number text not null unique,
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now()
);

-- 6) Consentimentos (LGPD/GDPR): imutáveis, com versão e timestamp
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('terms', 'privacy', 'marketing')),
  version text not null,
  accepted boolean not null,
  created_at timestamptz not null default now()
);

-- 7) updated_at automático em profiles
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- 8) `email` e `created_at` de profiles não são editáveis pelo cliente —
--    RLS só restringe QUAIS LINHAS, não QUAIS COLUNAS, um dono pode alterar.
--    Este trigger garante que um PATCH direto ao PostgREST não consiga
--    forjar um e-mail ou uma data de criação diferente da real.
create or replace function public.protect_profile_immutable_columns()
returns trigger
language plpgsql
as $$
begin
  new.email = old.email;
  new.created_at = old.created_at;
  return new;
end;
$$;

create trigger profiles_protect_immutable_columns
before update on public.profiles
for each row execute function public.protect_profile_immutable_columns();

-- 9) `consents.created_at` também não pode ser escolhido pelo cliente no
--    INSERT (senão um usuário poderia forjar a data de um consentimento
--    legal) — o valor default só vale se a coluna for omitida, não se o
--    cliente enviar um valor explícito, então força-se aqui.
create or replace function public.force_consent_created_at()
returns trigger
language plpgsql
as $$
begin
  new.created_at = now();
  return new;
end;
$$;

create trigger consents_force_created_at
before insert on public.consents
for each row execute function public.force_consent_created_at();

-- 10) Mantém profiles.email em sincronia quando o e-mail muda pelo fluxo
--     verificado do Supabase Auth (o único jeito de mudar e-mail, já que o
--     trigger acima trava a coluna contra escrita direta do cliente).
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_updated
after update of email on auth.users
for each row execute function public.handle_user_email_change();

-- 11) Novo usuário → perfil + papel customer + suite + consentimento dos
--     termos (vindo do metadata do signUp), tudo atômico.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, email, country)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'country', '')
  );

  insert into public.user_roles (user_id, role)
  values (new.id, 'customer');

  insert into public.suites (user_id, suite_number)
  values (new.id, 'BUF-' || nextval('public.suite_number_seq'));

  insert into public.consents (user_id, kind, version, accepted)
  values (
    new.id,
    'terms',
    coalesce(new.raw_user_meta_data ->> 'terms_version', 'unknown'),
    -- Comparação tolerante em vez de ::boolean — um valor inesperado em
    -- metadata do cliente não pode abortar a transação inteira de signup;
    -- na dúvida, assume não-aceito (o valor mais seguro).
    coalesce(lower(new.raw_user_meta_data ->> 'terms_accepted') in ('true', 't', '1', 'yes'), false)
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 12) RLS ligado em TODAS as tabelas
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.suites enable row level security;
alter table public.consents enable row level security;

-- profiles: dono lê/atualiza o próprio; admin lê tudo. Sem INSERT/DELETE
-- pelo cliente (só o trigger cria). UPDATE restrito por RLS à própria
-- linha, e por GRANT de coluna a name/country apenas (email/created_at são
-- protegidos pelo trigger acima, não pelo GRANT, mas o GRANT documenta a
-- intenção e barra outras colunas que venham a existir aqui).
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.has_role((select auth.uid()), 'admin'));

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke update on public.profiles from authenticated;
grant update (name, country) on public.profiles to authenticated;

-- user_roles: dono lê os próprios papéis; admin lê tudo. Sem escrita pelo
-- cliente (nenhuma policy de insert/update/delete = bloqueado por RLS).
create policy "user_roles_select_own_or_admin" on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or private.has_role((select auth.uid()), 'admin'));

-- suites: dono lê a própria; admin lê tudo. Sem escrita pelo cliente.
create policy "suites_select_own_or_admin" on public.suites
  for select to authenticated
  using (user_id = (select auth.uid()) or private.has_role((select auth.uid()), 'admin'));

-- consents: dono lê e registra os próprios; sem UPDATE/DELETE (imutável —
-- reforçado tanto por RLS (sem essas policies) quanto pelo GRANT abaixo).
create policy "consents_select_own_or_admin" on public.consents
  for select to authenticated
  using (user_id = (select auth.uid()) or private.has_role((select auth.uid()), 'admin'));

create policy "consents_insert_own" on public.consents
  for insert to authenticated
  with check (user_id = (select auth.uid()));

revoke update, delete on public.consents from authenticated;
