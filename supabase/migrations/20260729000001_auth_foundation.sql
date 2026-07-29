-- ============================================================
-- Fase 2 — Fundação de auth: perfis, papéis, suites, consentimentos
-- Aplicar no SQL Editor do Supabase (ou via supabase db push).
-- ============================================================

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

-- 3) Checagem de papel. SECURITY DEFINER: evita recursão de RLS ao ser
--    usada dentro das próprias policies.
create or replace function public.has_role(_user_id uuid, _role public.app_role)
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

create table public.suites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
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

-- 8) Novo usuário → perfil + papel customer + suite + consentimento dos
--    termos (vindo do metadata do signUp), tudo atômico.
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
    coalesce((new.raw_user_meta_data ->> 'terms_accepted')::boolean, false)
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 9) RLS ligado em TODAS as tabelas
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.suites enable row level security;
alter table public.consents enable row level security;

-- profiles: dono lê/atualiza o próprio; admin lê tudo. Sem INSERT/DELETE
-- pelo cliente (só o trigger cria).
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- user_roles: dono lê os próprios papéis; admin lê tudo. Sem escrita pelo cliente.
create policy "user_roles_select_own_or_admin" on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));

-- suites: dono lê a própria; admin lê tudo. Sem escrita pelo cliente.
create policy "suites_select_own_or_admin" on public.suites
  for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));

-- consents: dono lê e registra os próprios; sem UPDATE/DELETE (imutável).
create policy "consents_select_own_or_admin" on public.consents
  for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));

create policy "consents_insert_own" on public.consents
  for insert to authenticated
  with check (user_id = (select auth.uid()));
