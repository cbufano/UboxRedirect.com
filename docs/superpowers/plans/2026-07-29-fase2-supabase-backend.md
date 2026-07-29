# Fase 2 — Backend Real (Supabase) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a camada mock de autenticação por Supabase real (Auth + Postgres + RLS), com suite gerada automaticamente no cadastro, e-mails de confirmação/recuperação, e páginas do dashboard lendo dados reais de perfil/suite.

**Architecture:** O frontend continua um SPA Vite/React. Entra um cliente Supabase único (`src/lib/supabase.ts`). O `authService` mantém o papel de camada de isolamento, mas vira **assíncrono** sobre `supabase.auth`. Um `AuthProvider` (React context) observa a sessão e alimenta `ProtectedRoute`/layouts. O schema (profiles, user_roles, suites, consents) vive em migration SQL versionada no repo e aplicada no Supabase; **RLS ligado em todas as tabelas** — papéis nunca no cliente, checados via função `has_role` SECURITY DEFINER. Um trigger em `auth.users` cria perfil + papel `customer` + suite `BUF-XXXXX` + registro de consentimento dos termos, atomicamente no signup.

**Tech Stack:** Vite 8, React 19, TS 6, `@supabase/supabase-js` v2, react-router 7, react-hook-form 7 + zod 4, react-i18next, Vitest 4 + RTL (testes mockam o módulo `src/lib/supabase`).

**Convenções deste plano:**
- Passos marcados **🧑‍💻 MANUAL** exigem o usuário (dashboard do Supabase, GitHub secrets). O agente PARA e pede ao usuário quando chegar neles.
- Testes de página **substituem** os arquivos de teste existentes (os atuais dependem do mock em localStorage, que deixa de existir).
- Idioma dos textos de UI: sempre via i18n nos 3 locales (en/pt/es). Commits em Conventional Commits.

---

## Estrutura de arquivos (visão geral)

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `supabase/migrations/20260729000001_auth_foundation.sql` | Schema, triggers, RLS | Criar |
| `.env.example` / `.env.local` | Variáveis Supabase | Criar |
| `src/vite-env.d.ts` | Tipagem das env vars | Modificar |
| `vite.config.ts` | Env fake para testes | Modificar |
| `src/lib/supabase.ts` | Cliente Supabase singleton | Criar |
| `src/services/authService.ts` | Auth real assíncrono (isolação) | Reescrever |
| `src/services/profileService.ts` | Perfil + suite (tabela `profiles`/`suites`) | Criar |
| `src/contexts/AuthContext.tsx` | AuthProvider + useAuth | Criar |
| `src/components/ProtectedRoute.tsx` | Guard async-aware | Modificar |
| `src/App.tsx` | Envolver com AuthProvider | Modificar |
| `src/config/warehouse.ts` | Endereço público do galpão (substitui `src/mocks/address.ts`) | Criar |
| `src/lib/address.ts` | `formatUsAddress(warehouse, suite, name?)` | Modificar |
| `src/pages/auth/{Login,Signup,Verify,Forgot}.tsx` | Fluxos reais | Modificar |
| `src/pages/auth/ResetPassword.tsx` | Nova senha via link de e-mail | Criar |
| `src/routes.tsx` | Rota `/reset-password` | Modificar |
| `src/layouts/DashboardLayout.tsx` | useAuth + logout async | Modificar |
| `src/pages/dashboard/{Overview,Address,Account}.tsx` | Suite/perfil reais | Modificar |
| `src/i18n/locales/{en,pt,es}/common.json` | Novas chaves | Modificar |
| `src/mocks/address.ts` | — | **Excluir** (Task 12) |
| `.github/workflows/deploy.yml` | Env vars Vite no build | Modificar |
| `.gitignore` | `!.env.example` | Modificar |

Fora de escopo da Fase 2 (fica para Fase 3+): Inbox/Ship/Shipments/Shopper continuam com mocks; troca de e-mail do usuário; painel admin; SMTP customizado (Resend) — os e-mails da Fase 2 usam o SMTP nativo do Supabase; buckets de Storage (o primeiro consumidor são as fotos de pacotes, na Fase 3 — criar bucket sem consumidor seria YAGNI).

---

## Task 1: Push pendente + criação do projeto Supabase (🧑‍💻 MANUAL)

**Files:** nenhum (operações de infra).

- [ ] **Step 1 (🧑‍💻 MANUAL): Cadastrar secrets FTP no GitHub**

O usuário deve criar em `https://github.com/cbufano/UboxRedirect.com` → Settings → Secrets and variables → Actions → New repository secret:
- `FTP_SERVER` — host FTP da Hostinger (ex.: `ftp.uboxredirect.com` ou IP mostrado no hPanel → Files → FTP Accounts)
- `FTP_USERNAME` — usuário FTP
- `FTP_PASSWORD` — senha FTP

- [ ] **Step 2: Enviar o commit pendente do CI**

O branch `master` está 1 commit à frente (`45e3f51`, workflow de deploy). Rodar:

```bash
git push origin master
```

Expected: push aceito; em seguida a action "Deploy para a Hostinger" roda em https://github.com/cbufano/UboxRedirect.com/actions e termina verde (testes + build + FTP). Se falhar no FTP, conferir com o usuário se `server-dir: ./public_html/` é o correto para a conta (pode ser `./`).

- [ ] **Step 3 (🧑‍💻 MANUAL): Criar o projeto Supabase**

O usuário deve:
1. Criar conta/projeto em https://supabase.com/dashboard — nome `bufano-redirect`, região **East US (North Virginia)** (mais perto de Miami), gerar senha forte do banco e guardar.
2. Em **Project Settings → API**, copiar `Project URL` e `anon public key` e passar ao agente (serão usados na Task 2 em `.env.local` e na Task 14 nos GitHub secrets).
3. Em **Authentication → Providers → Email**: deixar **Email habilitado** e **"Confirm email" LIGADO**.
4. Em **Authentication → URL Configuration**:
   - Site URL: `https://uboxredirect.com`
   - Redirect URLs: adicionar `http://localhost:5173/**` e `https://uboxredirect.com/**`

- [ ] **Step 4: Verificar**

Confirmar que o usuário forneceu `Project URL` e `anon key` antes de seguir para a Task 2.

---

## Task 2: Dependência, env vars e cliente Supabase

**Files:**
- Create: `.env.example`, `.env.local` (não commitado), `src/lib/supabase.ts`
- Modify: `.gitignore`, `src/vite-env.d.ts`, `vite.config.ts`
- Test: `src/lib/supabase.test.ts`

- [ ] **Step 1: Instalar o SDK**

```bash
npm install @supabase/supabase-js
```

Expected: instala v2.x sem erros.

- [ ] **Step 2: Criar `.env.example` e liberá-lo no .gitignore**

`.env.example`:

```bash
# Copie este arquivo para .env.local e preencha com os valores do painel do
# Supabase (Project Settings → API).
# A anon key é PÚBLICA por design — a segurança vem das policies de RLS.
# NUNCA coloque a service_role key em nenhum arquivo do frontend.
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key-aqui
```

No `.gitignore`, logo após a linha `.env.*`, adicionar:

```
!.env.example
```

- [ ] **Step 3: Criar `.env.local` com os valores reais** (fornecidos na Task 1; arquivo fica fora do git)

- [ ] **Step 4: Tipar as env vars em `src/vite-env.d.ts`** (substituir o conteúdo)

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

- [ ] **Step 5: Env fake para os testes em `vite.config.ts`**

Sem isso, qualquer teste que importe (transitivamente) `src/lib/supabase.ts` quebra por env ausente. Substituir o bloco `test` por:

```ts
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
```

- [ ] **Step 6: Escrever o teste que falha** — `src/lib/supabase.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { supabase } from './supabase'

describe('supabase client', () => {
  it('exports a configured client', () => {
    expect(supabase).toBeDefined()
    expect(supabase.auth).toBeDefined()
  })
})
```

Run: `npx vitest run src/lib/supabase.test.ts`
Expected: FAIL — `Cannot find module './supabase'`.

- [ ] **Step 7: Implementar `src/lib/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example to .env.local and fill it in.',
  )
}

export const supabase = createClient(url, anonKey)
```

- [ ] **Step 8: Rodar o teste**

Run: `npx vitest run src/lib/supabase.test.ts`
Expected: PASS.

- [ ] **Step 9: Suíte completa ainda verde**

Run: `npm test`
Expected: todos os testes existentes continuam passando (nada os importa ainda).

- [ ] **Step 10: Commit**

```bash
git add .env.example .gitignore src/vite-env.d.ts vite.config.ts src/lib/supabase.ts src/lib/supabase.test.ts package.json package-lock.json
git commit -m "feat: add supabase client, env wiring and test env"
```

---

## Task 3: Migration SQL — fundação (profiles, roles, suites, consents, RLS)

**Files:**
- Create: `supabase/migrations/20260729000001_auth_foundation.sql`

- [ ] **Step 1: Criar o arquivo de migration** com exatamente este conteúdo:

```sql
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
```

- [ ] **Step 2 (🧑‍💻 MANUAL ou via CLI): Aplicar a migration**

Opção A (mais simples): usuário abre o **SQL Editor** no dashboard do Supabase, cola o conteúdo do arquivo e roda ("Success. No rows returned").
Opção B: `npx supabase@latest link --project-ref <ref>` e `npx supabase db push` (exige o CLI logado).

- [ ] **Step 3: Verificar no banco** (SQL Editor):

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public';
```

Expected: `profiles`, `user_roles`, `suites`, `consents` — todos com `rowsecurity = true`.

```sql
select count(*) from pg_policies where schemaname = 'public';
```

Expected: `6` policies.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260729000001_auth_foundation.sql
git commit -m "feat: auth foundation schema — profiles, roles, suites, consents with RLS"
```

---

## Task 4: authService real (assíncrono sobre Supabase Auth)

**Files:**
- Modify: `src/services/authService.ts` (reescrever)
- Test: `src/services/authService.test.ts` (reescrever)

- [ ] **Step 1: Reescrever o teste** — `src/services/authService.test.ts` (substituir todo o arquivo). O teste mocka o módulo do cliente:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { authService, TERMS_VERSION } from './authService'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
    },
  },
}))

const mockedAuth = vi.mocked(supabase.auth)

const supabaseUser = {
  id: 'uuid-1',
  email: 'ana@example.com',
  user_metadata: { name: 'Ana', country: 'BR' },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('register', () => {
  it('signs up with profile metadata including terms consent', async () => {
    mockedAuth.signUp.mockResolvedValue({
      data: { user: supabaseUser, session: null },
      error: null,
    } as never)

    const result = await authService.register({
      name: 'Ana',
      email: 'ana@example.com',
      country: 'BR',
      password: 'secret12',
    })

    expect(mockedAuth.signUp).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'secret12',
      options: {
        data: { name: 'Ana', country: 'BR', terms_accepted: true, terms_version: TERMS_VERSION },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })
    expect(result.user).toEqual({ id: 'uuid-1', name: 'Ana', email: 'ana@example.com', country: 'BR' })
    expect(result.needsEmailConfirmation).toBe(true)
  })

  it('reports no confirmation needed when a session is returned', async () => {
    mockedAuth.signUp.mockResolvedValue({
      data: { user: supabaseUser, session: { access_token: 'x' } },
      error: null,
    } as never)

    const result = await authService.register({
      name: 'Ana',
      email: 'ana@example.com',
      country: 'BR',
      password: 'secret12',
    })
    expect(result.needsEmailConfirmation).toBe(false)
  })

  it('throws on signUp error', async () => {
    mockedAuth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'User already registered' },
    } as never)

    await expect(
      authService.register({ name: 'Ana', email: 'ana@example.com', country: 'BR', password: 'secret12' }),
    ).rejects.toThrow('User already registered')
  })
})

describe('login', () => {
  it('returns the mapped user on success', async () => {
    mockedAuth.signInWithPassword.mockResolvedValue({
      data: { user: supabaseUser, session: { access_token: 'x' } },
      error: null,
    } as never)

    const user = await authService.login('ana@example.com', 'secret12')
    expect(user).toEqual({ id: 'uuid-1', name: 'Ana', email: 'ana@example.com', country: 'BR' })
  })

  it('throws on invalid credentials', async () => {
    mockedAuth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    } as never)

    await expect(authService.login('ana@example.com', 'wrong')).rejects.toThrow('Invalid login credentials')
  })
})

describe('session', () => {
  it('getSession maps the current user', async () => {
    mockedAuth.getSession.mockResolvedValue({
      data: { session: { user: supabaseUser } },
      error: null,
    } as never)

    expect(await authService.getSession()).toEqual({
      id: 'uuid-1',
      name: 'Ana',
      email: 'ana@example.com',
      country: 'BR',
    })
  })

  it('getSession returns null when signed out', async () => {
    mockedAuth.getSession.mockResolvedValue({ data: { session: null }, error: null } as never)
    expect(await authService.getSession()).toBeNull()
  })

  it('onAuthStateChange forwards mapped users and returns an unsubscriber', () => {
    const unsubscribe = vi.fn()
    mockedAuth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe } },
    } as never)

    const callback = vi.fn()
    const dispose = authService.onAuthStateChange(callback)

    const registered = mockedAuth.onAuthStateChange.mock.calls[0][0]
    registered('SIGNED_IN', { user: supabaseUser } as never)
    expect(callback).toHaveBeenCalledWith({ id: 'uuid-1', name: 'Ana', email: 'ana@example.com', country: 'BR' })

    dispose()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('logout signs out', async () => {
    mockedAuth.signOut.mockResolvedValue({ error: null } as never)
    await authService.logout()
    expect(mockedAuth.signOut).toHaveBeenCalled()
  })
})

describe('password reset', () => {
  it('requestPasswordReset sends the recovery email with redirect', async () => {
    mockedAuth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null } as never)
    await authService.requestPasswordReset('ana@example.com')
    expect(mockedAuth.resetPasswordForEmail).toHaveBeenCalledWith('ana@example.com', {
      redirectTo: `${window.location.origin}/reset-password`,
    })
  })

  it('updatePassword updates the user password', async () => {
    mockedAuth.updateUser.mockResolvedValue({ data: { user: supabaseUser }, error: null } as never)
    await authService.updatePassword('newpass99')
    expect(mockedAuth.updateUser).toHaveBeenCalledWith({ password: 'newpass99' })
  })
})
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/services/authService.test.ts`
Expected: FAIL — `TERMS_VERSION` não exportado / métodos inexistentes.

- [ ] **Step 3: Reescrever `src/services/authService.ts`** (substituir todo o arquivo):

```ts
/**
 * authService — camada de isolamento de autenticação, agora sobre Supabase.
 * Consumidores nunca importam o supabase-js diretamente para auth: sempre
 * este módulo. Toda a API é assíncrona.
 */
import { supabase } from '../lib/supabase'
import type { User as SupabaseUser } from '@supabase/supabase-js'

/** Versão dos Termos aceitos no cadastro — gravada em consents pelo trigger. */
export const TERMS_VERSION = '2026-07-29'

export interface User {
  id: string
  name: string
  email: string
  country: string
}

export interface RegisterInput {
  name: string
  email: string
  country: string
  password: string
}

export interface RegisterResult {
  user: User | null
  /** true quando o Supabase exige confirmação por e-mail antes do login. */
  needsEmailConfirmation: boolean
}

function mapUser(supabaseUser: SupabaseUser | null | undefined): User | null {
  if (!supabaseUser) return null
  const metadata = (supabaseUser.user_metadata ?? {}) as Record<string, unknown>
  return {
    id: supabaseUser.id,
    name: typeof metadata.name === 'string' ? metadata.name : '',
    email: supabaseUser.email ?? '',
    country: typeof metadata.country === 'string' ? metadata.country : '',
  }
}

export const authService = {
  async register(data: RegisterInput): Promise<RegisterResult> {
    const { data: result, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          name: data.name,
          country: data.country,
          terms_accepted: true,
          terms_version: TERMS_VERSION,
        },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })
    if (error) throw new Error(error.message)
    return { user: mapUser(result.user), needsEmailConfirmation: !result.session }
  },

  async login(email: string, password: string): Promise<User> {
    const { data: result, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    const user = mapUser(result.user)
    if (!user) throw new Error('Invalid credentials')
    return user
  },

  async logout(): Promise<void> {
    await supabase.auth.signOut()
  },

  async getSession(): Promise<User | null> {
    const { data } = await supabase.auth.getSession()
    return mapUser(data.session?.user)
  },

  /** Observa mudanças de sessão; retorna a função de unsubscribe. */
  onAuthStateChange(callback: (user: User | null) => void): () => void {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(mapUser(session?.user))
    })
    return () => data.subscription.unsubscribe()
  },

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw new Error(error.message)
  },

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw new Error(error.message)
  },
}
```

- [ ] **Step 4: Rodar o teste do serviço**

Run: `npx vitest run src/services/authService.test.ts`
Expected: PASS (11 testes).

**Nota:** `npm test` completo ainda NÃO fica verde aqui — as páginas que chamavam a API síncrona quebram em compilação/testes. Elas são corrigidas nas Tasks 5–13. Não tentar "consertar rápido" fora da ordem do plano.

- [ ] **Step 5: Commit**

```bash
git add src/services/authService.ts src/services/authService.test.ts
git commit -m "feat: async authService backed by Supabase Auth"
```

---

## Task 5: AuthContext + useAuth

**Files:**
- Create: `src/contexts/AuthContext.tsx`
- Test: `src/contexts/AuthContext.test.tsx`

- [ ] **Step 1: Escrever o teste que falha** — `src/contexts/AuthContext.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'
import { authService } from '../services/authService'

vi.mock('../services/authService', () => ({
  authService: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
  },
}))

const mocked = vi.mocked(authService)

function Probe() {
  const { user, loading } = useAuth()
  if (loading) return <p>probe:loading</p>
  return <p>{user ? `probe:${user.name}` : 'probe:anonymous'}</p>
}

beforeEach(() => {
  vi.clearAllMocks()
  mocked.onAuthStateChange.mockReturnValue(() => {})
})

it('starts loading, then exposes the session user', async () => {
  mocked.getSession.mockResolvedValue({ id: '1', name: 'Ana', email: 'a@b.c', country: 'BR' })
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
  expect(screen.getByText('probe:loading')).toBeInTheDocument()
  expect(await screen.findByText('probe:Ana')).toBeInTheDocument()
})

it('exposes null user when signed out', async () => {
  mocked.getSession.mockResolvedValue(null)
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
  expect(await screen.findByText('probe:anonymous')).toBeInTheDocument()
})

it('updates when auth state changes', async () => {
  mocked.getSession.mockResolvedValue(null)
  let fire: (user: { id: string; name: string; email: string; country: string } | null) => void = () => {}
  mocked.onAuthStateChange.mockImplementation((cb) => {
    fire = cb
    return () => {}
  })
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
  await screen.findByText('probe:anonymous')
  fire({ id: '1', name: 'Bia', email: 'b@b.c', country: 'PT' })
  expect(await screen.findByText('probe:Bia')).toBeInTheDocument()
})
```

Run: `npx vitest run src/contexts/AuthContext.test.tsx`
Expected: FAIL — módulo não existe.

- [ ] **Step 2: Implementar `src/contexts/AuthContext.tsx`**

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { authService, type User } from '../services/authService'

interface AuthContextValue {
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    authService.getSession().then((sessionUser) => {
      if (!active) return
      setUser(sessionUser)
      setLoading(false)
    })

    const unsubscribe = authService.onAuthStateChange((changedUser) => {
      if (!active) return
      setUser(changedUser)
      setLoading(false)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}
```

- [ ] **Step 3: Rodar o teste**

Run: `npx vitest run src/contexts/AuthContext.test.tsx`
Expected: PASS (3 testes).

- [ ] **Step 4: Commit**

```bash
git add src/contexts/AuthContext.tsx src/contexts/AuthContext.test.tsx
git commit -m "feat: AuthProvider context over async auth session"
```

---

## Task 6: ProtectedRoute async-aware + wiring no App

**Files:**
- Modify: `src/components/ProtectedRoute.tsx`, `src/App.tsx`
- Test: `src/components/ProtectedRoute.test.tsx` (reescrever)

- [ ] **Step 1: Reescrever o teste** — `src/components/ProtectedRoute.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProtectedRoute } from './ProtectedRoute'
import { useAuth } from '../contexts/AuthContext'

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))
const mockedUseAuth = vi.mocked(useAuth)

function renderGuard() {
  render(
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <div>Private area</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

it('shows a loading state while the session resolves', () => {
  mockedUseAuth.mockReturnValue({ user: null, loading: true })
  renderGuard()
  expect(screen.getByText('Loading…')).toBeInTheDocument()
})

it('redirects to /login when there is no user', () => {
  mockedUseAuth.mockReturnValue({ user: null, loading: false })
  renderGuard()
  expect(screen.getByText('Login page')).toBeInTheDocument()
})

it('renders children when authenticated', () => {
  mockedUseAuth.mockReturnValue({
    user: { id: '1', name: 'Ana', email: 'a@b.c', country: 'BR' },
    loading: false,
  })
  renderGuard()
  expect(screen.getByText('Private area')).toBeInTheDocument()
})
```

Run: `npx vitest run src/components/ProtectedRoute.test.tsx`
Expected: FAIL (componente ainda usa authService síncrono).

- [ ] **Step 2: Reescrever `src/components/ProtectedRoute.tsx`**

```tsx
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="p-10 text-center text-slate/60">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}
```

- [ ] **Step 3: Envolver o app — `src/App.tsx`** (substituir):

```tsx
import { AppRoutes } from './routes'
import { DocumentMeta } from './components/DocumentMeta'
import { AuthProvider } from './contexts/AuthContext'

export default function App() {
  return (
    <AuthProvider>
      <DocumentMeta />
      <AppRoutes />
    </AuthProvider>
  )
}
```

- [ ] **Step 4: Rodar o teste**

Run: `npx vitest run src/components/ProtectedRoute.test.tsx`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/components/ProtectedRoute.tsx src/components/ProtectedRoute.test.tsx src/App.tsx
git commit -m "feat: session-aware ProtectedRoute and app-level AuthProvider"
```

---

## Task 7: Login assíncrono

**Files:**
- Modify: `src/pages/auth/Login.tsx` (só o `onSubmit`)
- Test: `src/pages/auth/Login.test.tsx` (reescrever)

- [ ] **Step 1: Reescrever o teste** — `src/pages/auth/Login.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import { authService } from '../../services/authService'
import Login from './Login'

vi.mock('../../services/authService', () => ({
  authService: { login: vi.fn() },
}))
const mocked = vi.mocked(authService)

function renderLogin() {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/app" element={<div>Dashboard Home</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

it('shows an error when credentials are invalid', async () => {
  mocked.login.mockRejectedValue(new Error('Invalid login credentials'))
  renderLogin()
  await userEvent.type(screen.getByLabelText(/email/i), 'nobody@example.com')
  await userEvent.type(screen.getByLabelText(/password/i), 'wrongpass')
  await userEvent.click(screen.getByRole('button', { name: /sign in|log in/i }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})

it('navigates to the dashboard on successful login', async () => {
  mocked.login.mockResolvedValue({ id: '1', name: 'Ana', email: 'ana@example.com', country: 'BR' })
  renderLogin()
  await userEvent.type(screen.getByLabelText(/email/i), 'ana@example.com')
  await userEvent.type(screen.getByLabelText(/password/i), 'secret12')
  await userEvent.click(screen.getByRole('button', { name: /sign in|log in/i }))
  expect(await screen.findByText('Dashboard Home')).toBeInTheDocument()
  expect(mocked.login).toHaveBeenCalledWith('ana@example.com', 'secret12')
})
```

Run: `npx vitest run src/pages/auth/Login.test.tsx`
Expected: FAIL (onSubmit ainda síncrono → navega mesmo com rejeição, ou erro de tipo).

- [ ] **Step 2: Atualizar o `onSubmit` em `src/pages/auth/Login.tsx`** — substituir:

```tsx
  const onSubmit: SubmitHandler<FormValues> = ({ email, password }) => {
    setAuthError(false)
    try {
      authService.login(email, password)
      navigate('/app')
    } catch {
      setAuthError(true)
    }
  }
```

por:

```tsx
  const onSubmit: SubmitHandler<FormValues> = async ({ email, password }) => {
    setAuthError(false)
    try {
      await authService.login(email, password)
      navigate('/app')
    } catch {
      setAuthError(true)
    }
  }
```

- [ ] **Step 3: Rodar o teste**

Run: `npx vitest run src/pages/auth/Login.test.tsx`
Expected: PASS (2 testes).

- [ ] **Step 4: Commit**

```bash
git add src/pages/auth/Login.tsx src/pages/auth/Login.test.tsx
git commit -m "feat: async login flow against real auth"
```

---

## Task 8: Signup assíncrono + página Verify vira "confira seu e-mail"

**Files:**
- Modify: `src/pages/auth/Signup.tsx` (só o `onSubmit`), `src/pages/auth/Verify.tsx`, `src/i18n/locales/{en,pt,es}/common.json`
- Test: `src/pages/auth/Signup.test.tsx` (reescrever), `src/pages/auth/Verify.test.tsx` (reescrever)

- [ ] **Step 1: Atualizar i18n** — nos 3 arquivos de locale, substituir o objeto `auth.verify` existente:

`en/common.json`:
```json
"verify": {
  "title": "Check your email",
  "body": "We sent a confirmation link to your email address. Click it to activate your account, then sign in.",
  "cta": "Back to sign in"
}
```

`pt/common.json`:
```json
"verify": {
  "title": "Confira seu e-mail",
  "body": "Enviamos um link de confirmação para o seu e-mail. Clique nele para ativar sua conta e depois faça login.",
  "cta": "Voltar para o login"
}
```

`es/common.json`:
```json
"verify": {
  "title": "Revisa tu correo",
  "body": "Te enviamos un enlace de confirmación a tu correo. Haz clic para activar tu cuenta y luego inicia sesión.",
  "cta": "Volver a iniciar sesión"
}
```

- [ ] **Step 2: Reescrever os testes**

`src/pages/auth/Signup.test.tsx` (substituir todo o arquivo):

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import { authService } from '../../services/authService'
import Signup from './Signup'

vi.mock('../../services/authService', () => ({
  authService: { register: vi.fn() },
}))
const mocked = vi.mocked(authService)

function renderSignup() {
  render(
    <MemoryRouter initialEntries={['/signup']}>
      <Routes>
        <Route path="/signup" element={<Signup />} />
        <Route path="/app" element={<div>Dashboard Home</div>} />
        <Route path="/verify" element={<div>Verify page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function fillForm() {
  await userEvent.type(screen.getByLabelText(/name/i), 'Ana Silva')
  await userEvent.type(screen.getByLabelText(/email/i), 'ana@example.com')
  await userEvent.selectOptions(screen.getByLabelText(/country/i), 'BR')
  await userEvent.type(screen.getByLabelText(/^password/i), 'secret12')
  await userEvent.type(screen.getByLabelText(/confirm/i), 'secret12')
  await userEvent.click(screen.getByRole('checkbox'))
}

beforeEach(() => vi.clearAllMocks())

it('sends the user to /verify when email confirmation is required', async () => {
  mocked.register.mockResolvedValue({ user: null, needsEmailConfirmation: true })
  renderSignup()
  await fillForm()
  await userEvent.click(screen.getByRole('button', { name: /create|sign up/i }))
  expect(await screen.findByText('Verify page')).toBeInTheDocument()
  expect(mocked.register).toHaveBeenCalledWith({
    name: 'Ana Silva',
    email: 'ana@example.com',
    country: 'BR',
    password: 'secret12',
  })
})

it('goes straight to the dashboard when no confirmation is needed', async () => {
  mocked.register.mockResolvedValue({
    user: { id: '1', name: 'Ana Silva', email: 'ana@example.com', country: 'BR' },
    needsEmailConfirmation: false,
  })
  renderSignup()
  await fillForm()
  await userEvent.click(screen.getByRole('button', { name: /create|sign up/i }))
  expect(await screen.findByText('Dashboard Home')).toBeInTheDocument()
})

it('shows an error when registration fails', async () => {
  mocked.register.mockRejectedValue(new Error('User already registered'))
  renderSignup()
  await fillForm()
  await userEvent.click(screen.getByRole('button', { name: /create|sign up/i }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})
```

`src/pages/auth/Verify.test.tsx` (substituir todo o arquivo):

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { it, expect } from 'vitest'
import '../../i18n'
import Verify from './Verify'

it('tells the user to check their email and links back to login', () => {
  render(
    <MemoryRouter>
      <Verify />
    </MemoryRouter>,
  )
  expect(screen.getByRole('heading', { name: /check your email/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /back to sign in/i })).toHaveAttribute('href', '/login')
})
```

Run: `npx vitest run src/pages/auth/Signup.test.tsx src/pages/auth/Verify.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Atualizar o `onSubmit` em `src/pages/auth/Signup.tsx`** — substituir:

```tsx
  const onSubmit: SubmitHandler<FormValues> = ({ name, email, country, password }) => {
    setAuthError(false)
    try {
      authService.register({ name, email, country, password })
      navigate('/app')
    } catch {
      setAuthError(true)
    }
  }
```

por:

```tsx
  const onSubmit: SubmitHandler<FormValues> = async ({ name, email, country, password }) => {
    setAuthError(false)
    try {
      const { needsEmailConfirmation } = await authService.register({ name, email, country, password })
      navigate(needsEmailConfirmation ? '/verify' : '/app')
    } catch {
      setAuthError(true)
    }
  }
```

- [ ] **Step 4: Atualizar `src/pages/auth/Verify.tsx`** (substituir todo o arquivo):

```tsx
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'

export default function Verify() {
  const { t } = useTranslation()

  return (
    <div className="mx-auto my-16 max-w-md px-4">
      <Card className="text-center">
        <MailCheck className="mx-auto h-12 w-12 text-brand" aria-hidden="true" />
        <h1 className="mt-4 text-3xl font-bold text-navy">{t('auth.verify.title')}</h1>
        <p className="mt-2 text-sm text-slate">{t('auth.verify.body')}</p>

        <div className="mt-6">
          <Link to="/login">
            <Button type="button" variant="primary" size="lg" className="w-full">
              {t('auth.verify.cta')}
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  )
}
```

- [ ] **Step 5: Rodar os testes**

Run: `npx vitest run src/pages/auth/Signup.test.tsx src/pages/auth/Verify.test.tsx`
Expected: PASS (4 testes).

- [ ] **Step 6: Commit**

```bash
git add src/pages/auth/Signup.tsx src/pages/auth/Signup.test.tsx src/pages/auth/Verify.tsx src/pages/auth/Verify.test.tsx src/i18n/locales
git commit -m "feat: real signup with email-confirmation flow"
```

---

## Task 9: DashboardLayout com useAuth + logout assíncrono

**Files:**
- Modify: `src/layouts/DashboardLayout.tsx`
- Test: `src/layouts/DashboardLayout.test.tsx` (reescrever)

- [ ] **Step 1: Reescrever o teste** — `src/layouts/DashboardLayout.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../i18n'
import { DashboardLayout } from './DashboardLayout'
import { authService } from '../services/authService'
import { useAuth } from '../contexts/AuthContext'

vi.mock('../services/authService', () => ({
  authService: { logout: vi.fn() },
}))
vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))

const mockedAuth = vi.mocked(authService)
const mockedUseAuth = vi.mocked(useAuth)

function renderLayout() {
  render(
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route path="/app" element={<DashboardLayout />}>
          <Route index element={<div>Overview content</div>} />
        </Route>
        <Route path="/" element={<div>Public home</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseAuth.mockReturnValue({
    user: { id: '1', name: 'Ana', email: 'a@b.c', country: 'BR' },
    loading: false,
  })
})

it('shows the signed-in user name', () => {
  renderLayout()
  expect(screen.getByText('Ana')).toBeInTheDocument()
})

it('signs out and navigates home', async () => {
  mockedAuth.logout.mockResolvedValue()
  renderLayout()
  await userEvent.click(screen.getByRole('button', { name: /sign out|log out/i }))
  expect(mockedAuth.logout).toHaveBeenCalled()
  expect(await screen.findByText('Public home')).toBeInTheDocument()
})
```

Run: `npx vitest run src/layouts/DashboardLayout.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Atualizar `src/layouts/DashboardLayout.tsx`** — três edits:

1. Adicionar import: `import { useAuth } from '../contexts/AuthContext'`
2. Substituir `const user = authService.getSession()` por `const { user } = useAuth()`
3. Substituir:

```tsx
  const handleSignOut = () => {
    authService.logout()
    navigate('/')
  }
```

por:

```tsx
  const handleSignOut = async () => {
    await authService.logout()
    navigate('/')
  }
```

(o import de `authService` permanece — ainda é usado pelo logout).

- [ ] **Step 3: Rodar o teste**

Run: `npx vitest run src/layouts/DashboardLayout.test.tsx`
Expected: PASS (2 testes).

- [ ] **Step 4: Commit**

```bash
git add src/layouts/DashboardLayout.tsx src/layouts/DashboardLayout.test.tsx
git commit -m "feat: dashboard layout reads session from AuthProvider"
```

---

## Task 10: Forgot real + página ResetPassword

**Files:**
- Modify: `src/pages/auth/Forgot.tsx`, `src/routes.tsx`, `src/i18n/locales/{en,pt,es}/common.json`
- Create: `src/pages/auth/ResetPassword.tsx`
- Test: `src/pages/auth/Forgot.test.tsx` (reescrever), `src/pages/auth/ResetPassword.test.tsx` (criar)

- [ ] **Step 1: Adicionar chaves i18n** — dentro do objeto `auth` de cada locale, adicionar a chave `reset` (irmã de `login`/`signup`/`forgot`/`verify`):

`en`:
```json
"reset": {
  "title": "Set a new password",
  "subtitle": "Choose a new password for your account.",
  "password": "New password",
  "confirmPassword": "Confirm new password",
  "submit": "Update password",
  "success": "Password updated! You can now sign in.",
  "error": "We couldn't update your password. Open the link from the email again and retry.",
  "backToLogin": "Back to sign in"
}
```

`pt`:
```json
"reset": {
  "title": "Defina uma nova senha",
  "subtitle": "Escolha uma nova senha para a sua conta.",
  "password": "Nova senha",
  "confirmPassword": "Confirmar nova senha",
  "submit": "Atualizar senha",
  "success": "Senha atualizada! Você já pode fazer login.",
  "error": "Não foi possível atualizar sua senha. Abra o link do e-mail novamente e tente de novo.",
  "backToLogin": "Voltar para o login"
}
```

`es`:
```json
"reset": {
  "title": "Define una nueva contraseña",
  "subtitle": "Elige una nueva contraseña para tu cuenta.",
  "password": "Nueva contraseña",
  "confirmPassword": "Confirmar nueva contraseña",
  "submit": "Actualizar contraseña",
  "success": "¡Contraseña actualizada! Ya puedes iniciar sesión.",
  "error": "No pudimos actualizar tu contraseña. Abre de nuevo el enlace del correo e inténtalo otra vez.",
  "backToLogin": "Volver a iniciar sesión"
}
```

- [ ] **Step 2: Escrever os testes que falham**

`src/pages/auth/Forgot.test.tsx` (substituir todo o arquivo):

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import { authService } from '../../services/authService'
import Forgot from './Forgot'

vi.mock('../../services/authService', () => ({
  authService: { requestPasswordReset: vi.fn() },
}))
const mocked = vi.mocked(authService)

beforeEach(() => vi.clearAllMocks())

it('requests a password reset and shows the success message', async () => {
  mocked.requestPasswordReset.mockResolvedValue()
  render(
    <MemoryRouter>
      <Forgot />
    </MemoryRouter>,
  )
  await userEvent.type(screen.getByLabelText(/email/i), 'ana@example.com')
  await userEvent.click(screen.getByRole('button', { name: /reset|send/i }))
  expect(await screen.findByRole('status')).toBeInTheDocument()
  expect(mocked.requestPasswordReset).toHaveBeenCalledWith('ana@example.com')
})
```

`src/pages/auth/ResetPassword.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import { authService } from '../../services/authService'
import ResetPassword from './ResetPassword'

vi.mock('../../services/authService', () => ({
  authService: { updatePassword: vi.fn() },
}))
const mocked = vi.mocked(authService)

function renderPage() {
  render(
    <MemoryRouter>
      <ResetPassword />
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

it('updates the password and shows success', async () => {
  mocked.updatePassword.mockResolvedValue()
  renderPage()
  await userEvent.type(screen.getByLabelText(/^new password/i), 'newpass99')
  await userEvent.type(screen.getByLabelText(/confirm/i), 'newpass99')
  await userEvent.click(screen.getByRole('button', { name: /update/i }))
  expect(await screen.findByRole('status')).toBeInTheDocument()
  expect(mocked.updatePassword).toHaveBeenCalledWith('newpass99')
})

it('validates that passwords match before submitting', async () => {
  renderPage()
  await userEvent.type(screen.getByLabelText(/^new password/i), 'newpass99')
  await userEvent.type(screen.getByLabelText(/confirm/i), 'different1')
  await userEvent.click(screen.getByRole('button', { name: /update/i }))
  expect(mocked.updatePassword).not.toHaveBeenCalled()
})

it('shows an error when the update fails', async () => {
  mocked.updatePassword.mockRejectedValue(new Error('expired'))
  renderPage()
  await userEvent.type(screen.getByLabelText(/^new password/i), 'newpass99')
  await userEvent.type(screen.getByLabelText(/confirm/i), 'newpass99')
  await userEvent.click(screen.getByRole('button', { name: /update/i }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})
```

Run: `npx vitest run src/pages/auth/Forgot.test.tsx src/pages/auth/ResetPassword.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Ligar o Forgot ao serviço** — em `src/pages/auth/Forgot.tsx`:

1. Adicionar import: `import { authService } from '../../services/authService'`
2. Substituir:

```tsx
  const onSubmit: SubmitHandler<FormValues> = () => {
    setSubmitted(true)
  }
```

por:

```tsx
  const onSubmit: SubmitHandler<FormValues> = async ({ email }) => {
    try {
      await authService.requestPasswordReset(email)
    } finally {
      // Sempre mostra sucesso — não revelamos se o e-mail existe (anti-enumeração).
      setSubmitted(true)
    }
  }
```

- [ ] **Step 4: Criar `src/pages/auth/ResetPassword.tsx`**

```tsx
import { useState } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { authService } from '../../services/authService'

export default function ResetPassword() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const schema = z
    .object({
      password: z.string().min(8),
      confirmPassword: z.string().min(1),
    })
    .superRefine((data, ctx) => {
      if (data.password !== data.confirmPassword) {
        ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: t('auth.reset.confirmPassword') })
      }
    })

  type FormValues = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  const onSubmit: SubmitHandler<FormValues> = async ({ password }) => {
    setStatus('idle')
    try {
      await authService.updatePassword(password)
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="mx-auto my-16 max-w-md px-4">
      <Card>
        <h1 className="text-3xl font-bold text-navy">{t('auth.reset.title')}</h1>
        <p className="mt-2 text-sm text-slate">{t('auth.reset.subtitle')}</p>

        {status === 'success' ? (
          <div role="status" className="mt-6">
            <div className="flex items-start gap-3 rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <span>{t('auth.reset.success')}</span>
            </div>
            <div className="mt-6">
              <Link to="/login">
                <Button type="button" variant="primary" size="lg" className="w-full">
                  {t('auth.reset.backToLogin')}
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <>
            {status === 'error' && (
              <p role="alert" className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                {t('auth.reset.error')}
              </p>
            )}
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6">
              <Input
                label={t('auth.reset.password')}
                id="password"
                type="password"
                autoComplete="new-password"
                error={errors.password?.message}
                {...register('password')}
              />
              <div className="mt-4">
                <Input
                  label={t('auth.reset.confirmPassword')}
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  error={errors.confirmPassword?.message}
                  {...register('confirmPassword')}
                />
              </div>
              <div className="mt-6">
                <Button type="submit" variant="primary" size="lg" className="w-full">
                  {t('auth.reset.submit')}
                </Button>
              </div>
            </form>
          </>
        )}
      </Card>
    </div>
  )
}
```

- [ ] **Step 5: Registrar a rota em `src/routes.tsx`**

Adicionar aos lazy imports (junto dos outros de auth):

```tsx
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'))
```

E dentro do bloco `<Route element={<PublicLayout />}>`, após a rota `verify`:

```tsx
          <Route path="reset-password" element={<ResetPassword />} />
```

- [ ] **Step 6: Rodar os testes**

Run: `npx vitest run src/pages/auth/Forgot.test.tsx src/pages/auth/ResetPassword.test.tsx`
Expected: PASS (4 testes).

- [ ] **Step 7: Commit**

```bash
git add src/pages/auth/Forgot.tsx src/pages/auth/Forgot.test.tsx src/pages/auth/ResetPassword.tsx src/pages/auth/ResetPassword.test.tsx src/routes.tsx src/i18n/locales
git commit -m "feat: real password recovery flow with reset page"
```

---

## Task 11: profileService (perfil + suite reais)

**Files:**
- Create: `src/services/profileService.ts`
- Test: `src/services/profileService.test.ts`

- [ ] **Step 1: Escrever o teste que falha** — `src/services/profileService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { profileService } from './profileService'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn(), updateUser: vi.fn() },
    from: vi.fn(),
  },
}))

const mockedSupabase = vi.mocked(supabase, { partial: true })
const mockedAuth = vi.mocked(supabase.auth)

const profileRow = {
  id: 'uuid-1',
  name: 'Ana',
  email: 'ana@example.com',
  country: 'BR',
  preferred_language: 'pt',
  suites: [{ suite_number: 'BUF-10482' }],
}

function mockSession(userId: string | null) {
  mockedAuth.getSession.mockResolvedValue({
    data: { session: userId ? { user: { id: userId } } : null },
    error: null,
  } as never)
}

beforeEach(() => vi.clearAllMocks())

describe('getMyProfile', () => {
  it('returns the mapped profile with suite number', async () => {
    mockSession('uuid-1')
    const single = vi.fn().mockResolvedValue({ data: profileRow, error: null })
    const eq = vi.fn().mockReturnValue({ single })
    const select = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ select } as never)

    const profile = await profileService.getMyProfile()

    expect(mockedSupabase.from).toHaveBeenCalledWith('profiles')
    expect(eq).toHaveBeenCalledWith('id', 'uuid-1')
    expect(profile).toEqual({
      id: 'uuid-1',
      name: 'Ana',
      email: 'ana@example.com',
      country: 'BR',
      preferredLanguage: 'pt',
      suiteNumber: 'BUF-10482',
    })
  })

  it('returns null when signed out', async () => {
    mockSession(null)
    expect(await profileService.getMyProfile()).toBeNull()
    expect(mockedSupabase.from).not.toHaveBeenCalled()
  })

  it('throws when the query fails', async () => {
    mockSession('uuid-1')
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const eq = vi.fn().mockReturnValue({ single })
    const select = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ select } as never)

    await expect(profileService.getMyProfile()).rejects.toThrow('boom')
  })
})

describe('updateMyProfile', () => {
  it('updates the profiles row and keeps auth metadata in sync', async () => {
    mockSession('uuid-1')
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    const update = vi.fn().mockReturnValue({ eq })
    mockedSupabase.from.mockReturnValue({ update } as never)
    mockedAuth.updateUser.mockResolvedValue({ data: { user: null }, error: null } as never)

    await profileService.updateMyProfile({ name: 'Ana Maria', country: 'PT' })

    expect(update).toHaveBeenCalledWith({ name: 'Ana Maria', country: 'PT' })
    expect(eq).toHaveBeenCalledWith('id', 'uuid-1')
    expect(mockedAuth.updateUser).toHaveBeenCalledWith({ data: { name: 'Ana Maria', country: 'PT' } })
  })

  it('throws when signed out', async () => {
    mockSession(null)
    await expect(profileService.updateMyProfile({ name: 'X', country: 'BR' })).rejects.toThrow()
  })
})
```

Run: `npx vitest run src/services/profileService.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 2: Implementar `src/services/profileService.ts`**

```ts
/**
 * profileService — leitura/edição do perfil do usuário logado e da sua
 * suite. Toda escrita passa por RLS: o usuário só alcança a própria linha.
 */
import { supabase } from '../lib/supabase'

export interface Profile {
  id: string
  name: string
  email: string
  country: string
  preferredLanguage: string
  suiteNumber: string | null
}

interface ProfileRow {
  id: string
  name: string
  email: string
  country: string
  preferred_language: string
  suites: { suite_number: string } | { suite_number: string }[] | null
}

function mapProfile(row: ProfileRow): Profile {
  const suite = Array.isArray(row.suites) ? row.suites[0] : row.suites
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    country: row.country,
    preferredLanguage: row.preferred_language,
    suiteNumber: suite?.suite_number ?? null,
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export const profileService = {
  async getMyProfile(): Promise<Profile | null> {
    const userId = await currentUserId()
    if (!userId) return null

    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, country, preferred_language, suites (suite_number)')
      .eq('id', userId)
      .single()
    if (error) throw new Error(error.message)
    return mapProfile(data as ProfileRow)
  },

  async updateMyProfile(input: { name: string; country: string }): Promise<void> {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not authenticated')

    const { error } = await supabase
      .from('profiles')
      .update({ name: input.name, country: input.country })
      .eq('id', userId)
    if (error) throw new Error(error.message)

    // O nome do header vem do user_metadata — manter em sincronia.
    const { error: authError } = await supabase.auth.updateUser({
      data: { name: input.name, country: input.country },
    })
    if (authError) throw new Error(authError.message)
  },
}
```

- [ ] **Step 3: Rodar o teste**

Run: `npx vitest run src/services/profileService.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 4: Commit**

```bash
git add src/services/profileService.ts src/services/profileService.test.ts
git commit -m "feat: profileService for profile and suite data"
```

---

## Task 12: Address e Overview com suite real (adeus mock de endereço)

**Files:**
- Create: `src/config/warehouse.ts`
- Modify: `src/lib/address.ts`, `src/pages/dashboard/Address.tsx`, `src/pages/dashboard/Overview.tsx`, `src/i18n/locales/{en,pt,es}/common.json`
- Delete: `src/mocks/address.ts`
- Test: `src/lib/shippingEstimator.test.ts` intocado; **reescrever** `src/pages/dashboard/Address.test.tsx` e `src/pages/dashboard/Overview.test.tsx`; ajustar teste de `src/lib/address.ts` se existir dentro de outro arquivo (verificar com `grep -rl "formatUsAddress" src --include=*.test.*` e atualizar chamadas para a nova assinatura).

- [ ] **Step 1: i18n** — adicionar em cada locale, dentro do objeto `dashboard`, a chave irmã de `nav`:

en: `"loading": "Loading…"` · pt: `"loading": "Carregando…"` · es: `"loading": "Cargando…"`

- [ ] **Step 2: Criar `src/config/warehouse.ts`**

```ts
/**
 * Endereço público do galpão em Doral, FL. Não é segredo — todo cliente usa
 * o mesmo endereço; quem identifica o cliente é a SUITE (vinda do banco).
 */
export interface WarehouseAddress {
  recipientPrefix: string
  street: string
  city: string
  state: string
  zip: string
  country: string
}

export const WAREHOUSE_ADDRESS: WarehouseAddress = {
  recipientPrefix: 'Your Name',
  street: '8390 NW 25th St',
  city: 'Doral',
  state: 'FL',
  zip: '33122',
  country: 'USA',
}
```

- [ ] **Step 3: Refatorar `src/lib/address.ts`** (substituir todo o arquivo — a suite agora chega por parâmetro):

```ts
import type { WarehouseAddress } from '../config/warehouse'

export interface FormattedAddress {
  recipient: string
  suite: string
  street: string
  cityStateZip: string
  country: string
  /** Texto multi-linha pronto para colar num formulário de checkout. */
  fullText: string
}

export function formatUsAddress(
  address: WarehouseAddress,
  suite: string,
  recipientName?: string,
): FormattedAddress {
  const recipient = recipientName?.trim() ? recipientName.trim() : address.recipientPrefix
  const cityStateZip = `${address.city}, ${address.state} ${address.zip}`
  const fullText = [recipient, `${address.street}, ${suite}`, cityStateZip, address.country].join('\n')

  return { recipient, suite, street: address.street, cityStateZip, country: address.country, fullText }
}
```

- [ ] **Step 4: Reescrever os testes de página**

`src/pages/dashboard/Address.test.tsx` (substituir todo o arquivo):

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import Address from './Address'
import { profileService } from '../../services/profileService'

vi.mock('../../services/profileService', () => ({
  profileService: { getMyProfile: vi.fn() },
}))
const mocked = vi.mocked(profileService)

beforeEach(() => vi.clearAllMocks())

it('shows the warehouse address with the real suite from the profile', async () => {
  mocked.getMyProfile.mockResolvedValue({
    id: '1',
    name: 'Ana',
    email: 'a@b.c',
    country: 'BR',
    preferredLanguage: 'pt',
    suiteNumber: 'BUF-10482',
  })
  render(
    <MemoryRouter>
      <Address />
    </MemoryRouter>,
  )
  expect(await screen.findByText('BUF-10482')).toBeInTheDocument()
  expect(screen.getAllByText(/8390 NW 25th St/).length).toBeGreaterThan(0)
})

it('shows a loading state while the profile resolves', () => {
  mocked.getMyProfile.mockReturnValue(new Promise(() => {}))
  render(
    <MemoryRouter>
      <Address />
    </MemoryRouter>,
  )
  expect(screen.getByText('Loading…')).toBeInTheDocument()
})
```

`src/pages/dashboard/Overview.test.tsx` (substituir todo o arquivo):

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import Overview from './Overview'
import { profileService } from '../../services/profileService'
import { useAuth } from '../../contexts/AuthContext'

vi.mock('../../services/profileService', () => ({
  profileService: { getMyProfile: vi.fn() },
}))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: vi.fn() }))

const mockedProfile = vi.mocked(profileService)
const mockedUseAuth = vi.mocked(useAuth)

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseAuth.mockReturnValue({
    user: { id: '1', name: 'Ana', email: 'a@b.c', country: 'BR' },
    loading: false,
  })
  mockedProfile.getMyProfile.mockResolvedValue({
    id: '1',
    name: 'Ana',
    email: 'a@b.c',
    country: 'BR',
    preferredLanguage: 'pt',
    suiteNumber: 'BUF-10482',
  })
})

it('greets the user and shows the real suite', async () => {
  render(
    <MemoryRouter>
      <Overview />
    </MemoryRouter>,
  )
  expect(screen.getByText(/Ana/)).toBeInTheDocument()
  expect(await screen.findByText(/BUF-10482/)).toBeInTheDocument()
})
```

Run: `npx vitest run src/pages/dashboard/Address.test.tsx src/pages/dashboard/Overview.test.tsx`
Expected: FAIL.

- [ ] **Step 5: Reescrever `src/pages/dashboard/Address.tsx`** (substituir todo o arquivo):

```tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { WAREHOUSE_ADDRESS } from '../../config/warehouse'
import { profileService, type Profile } from '../../services/profileService'
import { Card } from '../../components/ui/Card'
import { CopyButton } from '../../components/ui/CopyButton'
import { formatUsAddress } from '../../lib/address'

export default function Address() {
  const { t } = useTranslation()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    profileService
      .getMyProfile()
      .then((data) => {
        if (active) setProfile(data)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  if (loading) return <p className="text-sm text-slate/60">{t('dashboard.loading')}</p>

  const suite = profile?.suiteNumber ?? '—'
  const address = formatUsAddress(WAREHOUSE_ADDRESS, suite, profile?.name)
  const copiedText = t('dashboard.address.copied')

  const lines = [
    { key: 'recipient', label: t('dashboard.address.labels.recipient'), value: address.recipient },
    { key: 'line1', label: t('dashboard.address.labels.line1'), value: address.street },
    { key: 'city', label: t('dashboard.address.labels.city'), value: WAREHOUSE_ADDRESS.city },
    { key: 'state', label: t('dashboard.address.labels.state'), value: WAREHOUSE_ADDRESS.state },
    { key: 'zip', label: t('dashboard.address.labels.zip'), value: WAREHOUSE_ADDRESS.zip },
    { key: 'country', label: t('dashboard.address.labels.country'), value: address.country },
  ]

  const instructions = t('dashboard.address.instructions.items', { returnObjects: true }) as string[]

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{t('dashboard.address.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate/70">{t('dashboard.address.subtitle')}</p>

      <Card className="mt-6 max-w-xl">
        <dl className="divide-y divide-slate/10">
          {lines.map((line) => (
            <div key={line.key} className="flex items-center justify-between gap-3 py-3 first:pt-0">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate/50">
                  {line.label}
                </dt>
                <dd className="text-sm font-medium text-navy">{line.value}</dd>
              </div>
              <CopyButton text={line.value} label={line.label} />
            </div>
          ))}

          {/* Suite — destacada, o campo que os clientes mais esquecem */}
          <div className="flex items-center justify-between gap-3 rounded-lg bg-brand/10 px-3 py-3">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-brand">
                {t('dashboard.address.labels.suite')}
              </dt>
              <dd className="text-lg font-bold text-brand">{address.suite}</dd>
            </div>
            <CopyButton text={address.suite} label={t('dashboard.address.labels.suite')} />
          </div>
        </dl>

        <p className="mt-4 text-xs text-slate/60">{t('dashboard.address.suiteNote')}</p>

        <div className="mt-6 border-t border-slate/10 pt-4">
          <CopyButton
            text={address.fullText}
            label={t('dashboard.address.fullAddressLabel')}
            visibleText={t('dashboard.address.copyFull')}
            copiedText={copiedText}
            className="w-full justify-center"
          />
        </div>
      </Card>

      <Card className="mt-6 max-w-xl">
        <h2 className="text-lg font-semibold text-navy">{t('dashboard.address.instructions.title')}</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate">
          {instructions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
```

- [ ] **Step 6: Atualizar `src/pages/dashboard/Overview.tsx`** — edits:

1. Trocar imports: remover `import { authService } ...` e `import { usAddress } from '../../mocks/address'`; adicionar:

```tsx
import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { WAREHOUSE_ADDRESS } from '../../config/warehouse'
import { profileService } from '../../services/profileService'
```

2. No corpo do componente, substituir:

```tsx
  const user = authService.getSession()
  // ... comentário existente ...
  const address = formatUsAddress(usAddress)
```

por:

```tsx
  const { user } = useAuth()
  const [suite, setSuite] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    profileService.getMyProfile().then((profile) => {
      if (active) setSuite(profile?.suiteNumber ?? null)
    })
    return () => {
      active = false
    }
  }, [])

  // O card mostra o hint genérico de destinatário (o nome já aparece na
  // saudação acima) — o cliente escreve o próprio nome no checkout da loja,
  // e o galpão o identifica pela suite.
  const address = formatUsAddress(WAREHOUSE_ADDRESS, suite ?? '—')
```

3. O restante do componente permanece igual (usa `address.*` como antes).

- [ ] **Step 7: Excluir o mock**

```bash
git rm src/mocks/address.ts
```

Depois rodar `npx tsc -b --noEmit` (ou `npm run build`) — nenhuma referência restante a `mocks/address` deve sobrar.

- [ ] **Step 8: Rodar os testes**

Run: `npx vitest run src/pages/dashboard/Address.test.tsx src/pages/dashboard/Overview.test.tsx`
Expected: PASS (3 testes).

- [ ] **Step 9: Commit**

```bash
git add -A src/config/warehouse.ts src/lib/address.ts src/pages/dashboard/Address.tsx src/pages/dashboard/Address.test.tsx src/pages/dashboard/Overview.tsx src/pages/dashboard/Overview.test.tsx src/i18n/locales src/mocks
git commit -m "feat: real suite number on Address and Overview from profile"
```

---

## Task 13: Account com perfil real (nome/país editáveis, e-mail travado)

**Files:**
- Modify: `src/pages/dashboard/Account.tsx`, `src/i18n/locales/{en,pt,es}/common.json`
- Test: `src/pages/dashboard/Account.test.tsx` (reescrever)

- [ ] **Step 1: i18n** — dentro de `dashboard.account.profile` em cada locale, adicionar duas chaves:

en:
```json
"emailLocked": "Email changes will be available soon. Contact support if you need to update it.",
"error": "We couldn't save your changes. Try again."
```
pt:
```json
"emailLocked": "A alteração de e-mail estará disponível em breve. Fale com o suporte se precisar atualizar.",
"error": "Não foi possível salvar suas alterações. Tente novamente."
```
es:
```json
"emailLocked": "El cambio de correo estará disponible pronto. Contacta con soporte si necesitas actualizarlo.",
"error": "No pudimos guardar tus cambios. Inténtalo de nuevo."
```

- [ ] **Step 2: Reescrever o teste** — `src/pages/dashboard/Account.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { it, expect, vi, beforeEach } from 'vitest'
import '../../i18n'
import Account from './Account'
import { profileService } from '../../services/profileService'

vi.mock('../../services/profileService', () => ({
  profileService: { getMyProfile: vi.fn(), updateMyProfile: vi.fn() },
}))
const mocked = vi.mocked(profileService)

beforeEach(() => {
  vi.clearAllMocks()
  mocked.getMyProfile.mockResolvedValue({
    id: '1',
    name: 'Ana',
    email: 'ana@example.com',
    country: 'BR',
    preferredLanguage: 'pt',
    suiteNumber: 'BUF-10482',
  })
})

function renderAccount() {
  render(
    <MemoryRouter>
      <Account />
    </MemoryRouter>,
  )
}

it('loads the profile into the form with email locked', async () => {
  renderAccount()
  expect(await screen.findByDisplayValue('Ana')).toBeInTheDocument()
  const email = screen.getByLabelText(/email/i)
  expect(email).toHaveValue('ana@example.com')
  expect(email).toBeDisabled()
})

it('saves name and country through profileService', async () => {
  mocked.updateMyProfile.mockResolvedValue()
  renderAccount()
  const name = await screen.findByDisplayValue('Ana')
  await userEvent.clear(name)
  await userEvent.type(name, 'Ana Maria')
  await userEvent.click(screen.getByRole('button', { name: /save|update/i }))
  expect(await screen.findByRole('status')).toBeInTheDocument()
  expect(mocked.updateMyProfile).toHaveBeenCalledWith({ name: 'Ana Maria', country: 'BR' })
})

it('shows an error when saving fails', async () => {
  mocked.updateMyProfile.mockRejectedValue(new Error('boom'))
  renderAccount()
  await screen.findByDisplayValue('Ana')
  await userEvent.click(screen.getByRole('button', { name: /save|update/i }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})
```

Run: `npx vitest run src/pages/dashboard/Account.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Atualizar `src/pages/dashboard/Account.tsx`** — edits na seção de perfil (o restante da página — idioma, notificações, endereços — permanece como está):

1. Imports: remover `import { authService } ...`; adicionar `import { useEffect } from 'react'` (juntar ao import de `useState`) e `import { profileService } from '../../services/profileService'`.

2. Substituir o início do componente:

```tsx
export default function Account() {
  const { t, i18n } = useTranslation()
  const session = authService.getSession()

  // --- Profile form ---
  const [profileSaved, setProfileSaved] = useState(false)
```

por:

```tsx
export default function Account() {
  const { t, i18n } = useTranslation()

  // --- Profile form ---
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileError, setProfileError] = useState(false)
```

3. No `useForm`, trocar os `defaultValues` (que liam `session`) por valores vazios e adicionar `reset` à desestruturação:

```tsx
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', country: '' },
  })
```

4. Logo após o `useForm`, adicionar o carregamento do perfil:

```tsx
  useEffect(() => {
    let active = true
    profileService.getMyProfile().then((profile) => {
      if (active && profile) {
        reset({ name: profile.name, email: profile.email, country: profile.country })
      }
    })
    return () => {
      active = false
    }
  }, [reset])
```

5. Substituir o `onValid`:

```tsx
  const onValid: SubmitHandler<FormValues> = () => {
    setProfileSaved(true)
  }
```

por:

```tsx
  const onValid: SubmitHandler<FormValues> = async ({ name, country }) => {
    setProfileError(false)
    try {
      await profileService.updateMyProfile({ name, country })
      setProfileSaved(true)
    } catch {
      setProfileError(true)
    }
  }
```

6. No JSX, marcar o campo de e-mail como travado — substituir o `<Input ... id="email" .../>` do formulário de perfil por:

```tsx
            <div>
              <Input
                label={t('dashboard.account.profile.email')}
                id="email"
                type="email"
                autoComplete="email"
                disabled
                error={errors.email?.message}
                {...register('email')}
              />
              <p className="mt-1 text-xs text-slate/60">{t('dashboard.account.profile.emailLocked')}</p>
            </div>
```

(Se o componente `Input` não repassar `disabled`, verificar `src/components/ui/Input.tsx` — ele usa spread de props de `<input>`, então repassa.)

7. Após o bloco `{profileSaved && (...)}`, adicionar o de erro:

```tsx
      {profileError && (
        <Card className="mt-6 max-w-xl" role="alert">
          <p className="text-sm text-red-600">{t('dashboard.account.profile.error')}</p>
        </Card>
      )}
```

- [ ] **Step 4: Rodar o teste**

Run: `npx vitest run src/pages/dashboard/Account.test.tsx`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboard/Account.tsx src/pages/dashboard/Account.test.tsx src/i18n/locales
git commit -m "feat: account page edits real profile data"
```

---

## Task 14: Suíte completa, CI com env vars, verificação de RLS e smoke test

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Suíte completa verde**

Run: `npm test`
Expected: TODOS os testes passam. Se algum teste antigo ainda referenciar a API síncrona do authService ou `mocks/address`, corrigi-lo no mesmo padrão dos testes reescritos nas tasks anteriores.

Run: `npm run build`
Expected: build sem erros de tipo.

- [ ] **Step 2: Env vars no build do CI** — em `.github/workflows/deploy.yml`, substituir:

```yaml
      - name: Compilar o site (gera dist/)
        run: npm run build
```

por:

```yaml
      - name: Compilar o site (gera dist/)
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
```

- [ ] **Step 3 (🧑‍💻 MANUAL): Cadastrar os secrets do Supabase no GitHub**

O usuário adiciona em Settings → Secrets and variables → Actions:
- `VITE_SUPABASE_URL` — a Project URL
- `VITE_SUPABASE_ANON_KEY` — a anon key

(São "secrets" por organização do pipeline; a anon key em si é pública por design.)

- [ ] **Step 4: Verificação de RLS no banco** (🧑‍💻 MANUAL ou via SQL Editor, com o usuário acompanhando)

No SQL Editor do Supabase, rodar e conferir:

```sql
-- 1. Nenhuma tabela pública sem RLS:
select tablename from pg_tables
where schemaname = 'public' and rowsecurity = false;
-- Expected: 0 linhas

-- 2. Anon não enxerga nada (simula um visitante sem login):
set local role anon;
select count(*) from public.profiles;
reset role;
-- Expected: count = 0 (ou permission denied)
```

- [ ] **Step 5: Smoke test E2E manual** (rodar `npm run dev` e executar com o usuário ou via browser tools):

1. `/signup` → cadastrar com e-mail real → deve navegar para `/verify`.
2. Abrir o e-mail de confirmação → clicar no link → fazer login em `/login` → cai em `/app`.
3. `/app/address` → a suite exibida deve ser `BUF-10001` (primeiro usuário da sequência) e o endereço de Doral.
4. No Supabase Table Editor: `profiles`, `suites`, `user_roles` (customer) e `consents` (terms, versão `2026-07-29`, accepted true) têm 1 linha cada para o novo usuário.
5. `/app/account` → alterar o nome → salvar → recarregar a página → nome persiste; o header do dashboard mostra o novo nome após novo login.
6. `/forgot` → pedir reset → e-mail chega → link abre `/reset-password` → trocar senha → login com a senha nova funciona.
7. Logout → tentar acessar `/app` direto → redireciona para `/login`.

- [ ] **Step 6: Commit e push final**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: inject supabase env vars into production build"
git push origin master
```

Expected: action roda verde e o site em produção usa o backend real.

- [ ] **Step 7: Atualizar o roadmap**

Em `docs/SISTEMA-E-ROADMAP.md`, marcar a Fase 2 como concluída (nota curta com a data), sem reescrever o resto do documento.

```bash
git add docs/SISTEMA-E-ROADMAP.md
git commit -m "docs: mark Fase 2 as delivered"
git push origin master
```

---

## Notas para o executor

- **Ordem importa:** Tasks 4–13 formam uma cadeia — a suíte de testes global só volta a ficar verde na Task 14. Rodar apenas os testes citados em cada task até lá.
- **Erros do Supabase em login não confirmado:** o Supabase retorna "Email not confirmed" como erro de login; a UI atual mostra o erro genérico de credenciais — comportamento aceito nesta fase.
- **Nunca** colocar a `service_role` key em nenhum arquivo do projeto.
- **StrictMode:** `useEffect` roda duas vezes em dev; os efeitos escritos aqui usam flag `active` + unsubscribe e são idempotentes — não "consertar" removendo o StrictMode.
- Qualquer divergência entre este plano e o código real encontrado (ex.: nome de chave i18n diferente) → seguir o padrão do código real e anotar a divergência no commit.
