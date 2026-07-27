# Bufano Redirect Site — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multilingual (EN/PT/ES) institutional website for Bufano Redirect (US package-forwarding service) plus a mock logged-in user dashboard, ready to later plug into a real backend.

**Architecture:** Vite + React + TypeScript SPA. Public pages and an auth-guarded dashboard share layouts. All "backend" behavior lives behind two isolated services (`authService`, `shippingEstimator`) so a real API swaps in without touching UI. i18n via react-i18next with per-page namespaces.

**Tech Stack (actual, as scaffolded):** Vite 8, React 19, TypeScript 6, **Tailwind CSS v4** (CSS-first via `@tailwindcss/vite` plugin — no `tailwind.config.js`), React Router v7, react-i18next v17 / i18next v26, react-hook-form v7, zod v4, Vitest v4 + React Testing Library, lucide-react (icons), oxlint. All APIs used in this plan are compatible across these versions.

**Plan conventions:**
- **Logic/infra tasks** (services, i18n, guards, calculator) include full code and strict TDD steps.
- **Presentational page tasks** specify exact files, section-by-section content, i18n keys, component usage, states, and acceptance criteria — the implementer writes idiomatic JSX to match. A smoke render test (`renders without crashing` + key text present) is required for each page.
- Every task ends with a commit. Conventional Commits style.
- Reference spec: `docs/superpowers/specs/2026-07-27-bufano-redirect-site-design.md`.

**Design tokens (Tailwind theme):** `navy #0B1F3A`, `blue #1E88E5`, `offwhite #F5F7FA`, `slate #0F172A`, `success #16A34A`.

---

## Phase 0 — Foundation

### Task 1: Scaffold Vite + React + TS project

**Files:**
- Create: project root files (`package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`)

- [ ] **Step 1: Scaffold**

Run in project root (already a git repo):
```bash
npm create vite@latest . -- --template react-ts
```
If prompted about the non-empty directory, choose "Ignore files and continue" (keeps `.git`, `docs/`, `.gitignore`).

- [ ] **Step 2: Install dependencies**

```bash
npm install react-router-dom react-i18next i18next i18next-browser-languagedetector react-hook-form zod @hookform/resolvers lucide-react
npm install -D tailwindcss postcss autoprefixer vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 3: Verify dev server runs**

Run: `npm run dev`
Expected: Vite serves on localhost with the default React page. Stop it (Ctrl+C).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TS project"
```

---

### Task 2: Configure Tailwind v4 + design tokens (CSS-first)

Tailwind v4 is CSS-first: **no `tailwind.config.js`**, no `npx tailwindcss init`. For Vite, use the official `@tailwindcss/vite` plugin and define the theme with `@theme` inside the CSS entry. Custom `--color-*` tokens automatically become utilities (e.g. `--color-navy` → `bg-navy`, `text-navy`, `border-navy`).

**Files:**
- Modify: `vite.config.ts`, `src/index.css`
- Install: `@tailwindcss/vite`

- [ ] **Step 1: Install the Vite plugin**

Run: `npm install -D @tailwindcss/vite`
(`autoprefixer`/`postcss` from Task 1 are unused with this plugin and may be left installed; do not add a `postcss.config.js`.)

- [ ] **Step 2: Register the plugin in `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```
(Keep any existing options; just add `tailwindcss()` to `plugins`. The Vitest `test` block is added in Task 3.)

- [ ] **Step 3: Replace `src/index.css`** (remove Vite's default template CSS)

```css
@import "tailwindcss";

@theme {
  --color-navy: #0B1F3A;
  --color-brand: #1E88E5;
  --color-offwhite: #F5F7FA;
  --color-slate: #0F172A;
  --color-success: #16A34A;
  --font-sans: "Inter", system-ui, sans-serif;
}

:root { color-scheme: light; }
body { @apply bg-white text-slate antialiased font-sans; }
```

- [ ] **Step 4: Remove leftover default styling**

Delete `src/App.css` and the default markup in `src/App.tsx` (the Vite/React logo demo); replace `App.tsx` body with a minimal `<div className="text-brand p-8">Bufano</div>` placeholder. Remove now-unused imports/assets (`src/assets/react.svg` import etc.) so `npm run build` has no unused-import/type errors.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: succeeds with no TypeScript errors. (Do not run `npm run dev` — it blocks.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: configure Tailwind v4 with brand design tokens"
```

---

### Task 3: Set up Vitest + React Testing Library

**Files:**
- Modify: `vite.config.ts`, `package.json`
- Create: `src/test/setup.ts`

- [ ] **Step 1: Configure test env in `vite.config.ts`**

Add to the config object:
```ts
/// <reference types="vitest" />
// inside defineConfig({ ... })
test: {
  globals: true,
  environment: 'jsdom',
  setupFiles: './src/test/setup.ts',
},
```

- [ ] **Step 2: Create `src/test/setup.ts`**

```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 3: Add scripts to `package.json`**

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 4: Write a trivial passing test** `src/test/sanity.test.ts`

```ts
import { describe, it, expect } from 'vitest'
describe('sanity', () => {
  it('runs', () => { expect(1 + 1).toBe(2) })
})
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: set up Vitest + React Testing Library"
```

---

### Task 4: i18n setup (EN/PT/ES) with language switcher

**Files:**
- Create: `src/i18n/index.ts`, `src/i18n/locales/en/common.json`, `.../pt/common.json`, `.../es/common.json`
- Create: `src/components/LanguageSwitcher.tsx`, `src/components/LanguageSwitcher.test.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write failing test** `src/components/LanguageSwitcher.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../i18n'
import { LanguageSwitcher } from './LanguageSwitcher'

it('changes language when a new option is chosen', async () => {
  render(<LanguageSwitcher />)
  await userEvent.selectOptions(screen.getByRole('combobox'), 'pt')
  expect(i18n.language).toBe('pt')
})
```

- [ ] **Step 2: Run test — expect FAIL** (module not found)

Run: `npm test -- LanguageSwitcher`

- [ ] **Step 3: Create `src/i18n/index.ts`**

```ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import enCommon from './locales/en/common.json'
import ptCommon from './locales/pt/common.json'
import esCommon from './locales/es/common.json'

export const SUPPORTED_LANGUAGES = ['en', 'pt', 'es'] as const

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon },
      pt: { common: ptCommon },
      es: { common: esCommon },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES,
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  })

export default i18n
```

- [ ] **Step 4: Create the three `common.json` files** with at least the nav keys:

`en/common.json`:
```json
{ "brand": "Bufano Redirect", "nav": { "how": "How it works", "pricing": "Pricing", "services": "Services", "calculator": "Calculator", "faq": "FAQ", "about": "About", "contact": "Contact", "login": "Sign in", "signup": "Create free account" } }
```
`pt/common.json`:
```json
{ "brand": "Bufano Redirect", "nav": { "how": "Como funciona", "pricing": "Preços", "services": "Serviços", "calculator": "Calculadora", "faq": "FAQ", "about": "Sobre", "contact": "Contato", "login": "Entrar", "signup": "Criar conta grátis" } }
```
`es/common.json`:
```json
{ "brand": "Bufano Redirect", "nav": { "how": "Cómo funciona", "pricing": "Precios", "services": "Servicios", "calculator": "Calculadora", "faq": "FAQ", "about": "Acerca de", "contact": "Contacto", "login": "Iniciar sesión", "signup": "Crear cuenta gratis" } }
```

- [ ] **Step 5: Create `src/components/LanguageSwitcher.tsx`**

```tsx
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES } from '../i18n'

const LABELS: Record<string, string> = { en: 'EN', pt: 'PT', es: 'ES' }

export function LanguageSwitcher() {
  const { i18n } = useTranslation()
  return (
    <select
      aria-label="Language"
      value={i18n.resolvedLanguage}
      onChange={(e) => i18n.changeLanguage(e.target.value)}
      className="rounded border border-white/20 bg-transparent px-2 py-1 text-sm"
    >
      {SUPPORTED_LANGUAGES.map((lng) => (
        <option key={lng} value={lng} className="text-slate">{LABELS[lng]}</option>
      ))}
    </select>
  )
}
```

- [ ] **Step 6: Import i18n in `src/main.tsx`** (add `import './i18n'` before rendering `<App />`).

- [ ] **Step 7: Run test — expect PASS**

Run: `npm test -- LanguageSwitcher`

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add i18n (EN/PT/ES) and language switcher"
```

---

### Task 5: Router + layouts skeleton

**Files:**
- Create: `src/routes.tsx`, `src/layouts/PublicLayout.tsx`, `src/layouts/DashboardLayout.tsx`
- Modify: `src/App.tsx`, `src/main.tsx`

- [ ] **Step 1: Wrap app in `BrowserRouter`** in `src/main.tsx`:

```tsx
import { BrowserRouter } from 'react-router-dom'
// render: <BrowserRouter><App /></BrowserRouter>
```

- [ ] **Step 2: Create `src/layouts/PublicLayout.tsx`**

```tsx
import { Outlet } from 'react-router-dom'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'

export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1"><Outlet /></main>
      <Footer />
    </div>
  )
}
```

- [ ] **Step 3: Create `src/layouts/DashboardLayout.tsx`** — sidebar + `<Outlet/>`. Placeholder sidebar for now (real nav in Task 24). Include a top bar with `LanguageSwitcher` and a "Sign out" button calling `authService.logout()`.

- [ ] **Step 4: Create `src/routes.tsx`** with a central route table. Use lazy placeholders returning simple `<div>` for pages not built yet so the app compiles:

```tsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { PublicLayout } from './layouts/PublicLayout'
// import pages as they are built; use <div/> stubs meanwhile

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<div>Home</div>} />
        {/* add public routes here as tasks complete */}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
```

- [ ] **Step 5: Render `<AppRoutes/>` from `src/App.tsx`.**

- [ ] **Step 6: Run** `npm run dev`, confirm home stub renders inside the layout. `npm run build` succeeds.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add router and public/dashboard layout skeletons"
```

---

## Phase 1 — Core Logic (strict TDD)

### Task 6: `shippingEstimator` — freight estimate by weight × zone

**Files:**
- Create: `src/lib/shippingEstimator.ts`, `src/lib/shippingEstimator.test.ts`

Interface:
```ts
export interface EstimateInput {
  destinationCountry: string   // ISO code, e.g. 'BR'
  weightKg: number
  lengthCm: number
  widthCm: number
  heightCm: number
}
export interface EstimateResult {
  chargeableWeightKg: number
  currency: 'USD'
  options: { carrier: string; etaDays: string; costUsd: number }[]
}
export function estimateShipping(input: EstimateInput): EstimateResult
```

- [ ] **Step 1: Write failing tests** `src/lib/shippingEstimator.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { estimateShipping } from './shippingEstimator'

describe('estimateShipping', () => {
  it('uses dimensional weight when it exceeds actual weight', () => {
    // 60x40x40 / 5000 = 19.2kg dimensional > 2kg actual
    const r = estimateShipping({ destinationCountry: 'BR', weightKg: 2, lengthCm: 60, widthCm: 40, heightCm: 40 })
    expect(r.chargeableWeightKg).toBe(19.2)
  })
  it('uses actual weight when it exceeds dimensional', () => {
    const r = estimateShipping({ destinationCountry: 'BR', weightKg: 10, lengthCm: 20, widthCm: 20, heightCm: 20 })
    expect(r.chargeableWeightKg).toBe(10)
  })
  it('returns at least one carrier option with positive cost', () => {
    const r = estimateShipping({ destinationCountry: 'BR', weightKg: 5, lengthCm: 30, widthCm: 30, heightCm: 30 })
    expect(r.options.length).toBeGreaterThan(0)
    expect(r.options[0].costUsd).toBeGreaterThan(0)
  })
  it('throws on non-positive weight', () => {
    expect(() => estimateShipping({ destinationCountry: 'BR', weightKg: 0, lengthCm: 10, widthCm: 10, heightCm: 10 })).toThrow()
  })
})
```

- [ ] **Step 2: Run — expect FAIL.** `npm test -- shippingEstimator`

- [ ] **Step 3: Implement `src/lib/shippingEstimator.ts`**

```ts
import type { EstimateInput, EstimateResult } from './shippingEstimator.types' // or inline the interfaces above

const DIM_DIVISOR = 5000 // cm³ per kg
// USD per chargeable kg by destination zone
const ZONE_RATE: Record<string, number> = { BR: 14, US: 6, DEFAULT: 18 }
const CARRIERS = [
  { carrier: 'Economy', etaDays: '8-14', mult: 1.0 },
  { carrier: 'Express', etaDays: '3-5', mult: 1.6 },
]
const BASE_FEE_USD = 8

export function estimateShipping(input: EstimateInput): EstimateResult {
  if (!(input.weightKg > 0)) throw new Error('weightKg must be positive')
  const dimWeight = (input.lengthCm * input.widthCm * input.heightCm) / DIM_DIVISOR
  const chargeable = Math.round(Math.max(input.weightKg, dimWeight) * 100) / 100
  const rate = ZONE_RATE[input.destinationCountry] ?? ZONE_RATE.DEFAULT
  const options = CARRIERS.map((c) => ({
    carrier: c.carrier,
    etaDays: c.etaDays,
    costUsd: Math.round((BASE_FEE_USD + chargeable * rate * c.mult) * 100) / 100,
  }))
  return { chargeableWeightKg: chargeable, currency: 'USD', options }
}
```
(Define the `EstimateInput`/`EstimateResult` interfaces in this file if not splitting into a `.types.ts`.)

- [ ] **Step 4: Run — expect PASS.** `npm test -- shippingEstimator`

- [ ] **Step 5: Commit** `git commit -am "feat: add shipping estimator with dimensional weight"`

---

### Task 7: `authService` — mock auth over localStorage

**Files:**
- Create: `src/services/authService.ts`, `src/services/authService.test.ts`

Interface:
```ts
export interface User { id: string; name: string; email: string; country: string }
export const authService = {
  register(data: { name: string; email: string; country: string; password: string }): User
  login(email: string, password: string): User   // throws on bad credentials
  logout(): void
  getSession(): User | null
}
```

- [ ] **Step 1: Write failing tests** `src/services/authService.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { authService } from './authService'

beforeEach(() => localStorage.clear())

describe('authService', () => {
  it('registers and creates a session', () => {
    const u = authService.register({ name: 'Ana', email: 'a@x.com', country: 'BR', password: 'secret12' })
    expect(u.email).toBe('a@x.com')
    expect(authService.getSession()?.email).toBe('a@x.com')
  })
  it('logs in with correct credentials', () => {
    authService.register({ name: 'Ana', email: 'a@x.com', country: 'BR', password: 'secret12' })
    authService.logout()
    const u = authService.login('a@x.com', 'secret12')
    expect(u.email).toBe('a@x.com')
  })
  it('throws on wrong password', () => {
    authService.register({ name: 'Ana', email: 'a@x.com', country: 'BR', password: 'secret12' })
    expect(() => authService.login('a@x.com', 'nope')).toThrow()
  })
  it('logout clears the session', () => {
    authService.register({ name: 'Ana', email: 'a@x.com', country: 'BR', password: 'secret12' })
    authService.logout()
    expect(authService.getSession()).toBeNull()
  })
})
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `src/services/authService.ts`**

Store a users list under `bufano.users` and current session under `bufano.session`. Passwords stored in this MOCK only (documented as mock — real backend will hash server-side). Generate ids with a counter/timestamp-free deterministic scheme (e.g., `email` as id) to keep tests robust. `register` throws if email already exists.

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit** `git commit -am "feat: add mock authService over localStorage"`

---

### Task 8: `ProtectedRoute` guard

**Files:**
- Create: `src/components/ProtectedRoute.tsx`, `src/components/ProtectedRoute.test.tsx`

- [ ] **Step 1: Write failing test** — renders children when `getSession()` returns a user; redirects to `/login` when null. Use `MemoryRouter` and a mocked `authService`.

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'
import { authService } from '../services/authService'
import { ProtectedRoute } from './ProtectedRoute'

it('redirects to /login when no session', () => {
  vi.spyOn(authService, 'getSession').mockReturnValue(null)
  render(
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/app" element={<ProtectedRoute><div>Secret</div></ProtectedRoute>} />
      </Routes>
    </MemoryRouter>
  )
  expect(screen.getByText('Login Page')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `ProtectedRoute` using `authService.getSession()` and `<Navigate to="/login" replace />`.

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit** `git commit -am "feat: add ProtectedRoute auth guard"`

---

## Phase 2 — Shared Components

### Task 9: Header (nav + language switcher + auth buttons)

**Files:**
- Create: `src/components/Header.tsx`, `src/components/Header.test.tsx`

**Spec:** navy background, sticky top. Left: brand text (`t('brand')`). Center/right (desktop): nav links to `/how`, `/pricing`, `/services`, `/calculator`, `/faq`, `/about`, `/contact` using `t('nav.*')` and `<NavLink>`. Right: `<LanguageSwitcher/>`, "Sign in" (`/login`, ghost) and "Create free account" (`/signup`, `bg-brand` button). Mobile: hamburger toggles a dropdown menu (`useState`). All links keyboard-focusable.

- [ ] **Step 1: Smoke test** — renders brand text and a nav link; hamburger button has `aria-label`. Wrap render in `MemoryRouter`.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement Header per spec.**
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** `git commit -am "feat: add site header with nav and language switcher"`

---

### Task 10: Footer

**Files:** Create `src/components/Footer.tsx`, `src/components/Footer.test.tsx`

**Spec:** navy footer, columns: brand + short pitch; link columns (Company: About, Contact, FAQ; Legal: Terms `/terms`, Privacy `/privacy`); contact info (email, hours). Bottom bar with copyright. Use i18n keys under `footer.*` (add to the three `common.json`).

- [ ] Steps: smoke test (renders Terms + Privacy links) → FAIL → implement → PASS → commit `feat: add site footer`.

---

### Task 11: UI primitives

**Files:** Create `src/components/ui/Button.tsx`, `Card.tsx`, `Section.tsx`, `Input.tsx`, `Accordion.tsx` (+ a combined `ui.test.tsx`).

**Spec:** small, typed, reusable primitives styled with tokens.
- `Button` variants: `primary` (bg-brand text-white), `secondary` (navy), `ghost`. Props: `variant`, `size`, standard button props. Renders `<button>`.
- `Card`: white, rounded-xl, subtle shadow, padding.
- `Section`: max-w container + vertical padding; optional `muted` (offwhite bg).
- `Input`: label + input + error text; forwards ref (for react-hook-form).
- `Accordion`: controlled expandable items (used by FAQ).

- [ ] Steps: test `Button` renders variant class + fires `onClick`; `Accordion` toggles panel visibility → FAIL → implement all → PASS → commit `feat: add shared UI primitives`.

---

## Phase 3 — Public Pages

> For every page task: create `src/pages/<Name>.tsx`, add its route in `routes.tsx`, add a `src/pages/<Name>.test.tsx` smoke test (renders without crashing + a key heading present, wrapped in `MemoryRouter`), add page i18n keys to a new namespace file `src/i18n/locales/<lng>/<page>.json` and register it in `src/i18n/index.ts`. End each task with a commit.

### Task 12: Home page (`/`)

**Sections (top→bottom):**
1. **Hero** — navy background, H1 (`home.hero.title`), subtitle, primary CTA "Create free account" → `/signup`, secondary "How it works" → `/how`. Right side: illustration placeholder box.
2. **How it works (5 steps)** — icon cards: US address → You buy → Arrives at warehouse → Consolidate → Ship worldwide.
3. **Benefits grid** — 4-6 cards (consolidation saves up to 80%, package photos, extended storage, worldwide shipping).
4. **Popular stores** — logo row (text chips ok for now: Amazon, eBay, Target, Walmart, Best Buy, Sephora).
5. **Savings example** — simple comparison figure (separate vs consolidated).
6. **Testimonials** — 3 quote cards.
7. **Final CTA band** — brand background, signup button.

- [ ] Smoke test → FAIL → implement → PASS → commit `feat: add home page`.

### Task 13: How It Works (`/how`)
Detailed 5-step vertical walkthrough (number, title, paragraph, small visual). Include a mid-page CTA and a short FAQ teaser linking to `/faq`. Keys under `how` namespace. → commit `feat: add how-it-works page`.

### Task 14: Pricing & Plans (`/pricing`)
Two plan cards: **Free** (7-day storage, US address, basic consolidation) vs **Premium** (45–90-day storage, free photos, priority, discounted rates) with feature lists and CTA. Below: **fee table** (per-service charges: consolidation, extra photos, repackaging, storage/day, value protection). Note "estimates, final at checkout". → commit `feat: add pricing page`.

### Task 15: Services (`/services`)
Grid of service detail cards: Consolidation, Repackaging, Package Photos, Personal Shopper, Value Protection, Extended Storage — each with icon, description, and (where relevant) a link to the dashboard action. → commit `feat: add services page`.

### Task 16: Shipping Calculator (`/calculator`)

**Files:** `src/pages/Calculator.tsx`, `Calculator.test.tsx`

**Spec:** form (react-hook-form + zod) with fields: destination country (select; include BR, US, PT, ES, others), weight (kg), length/width/height (cm). On submit, call `estimateShipping()` and render the result: chargeable weight + a table of carrier options (carrier, ETA, cost USD). Show zod validation errors inline. No network.

- [ ] **Step 1: Write test** — fill valid values, submit, assert a cost string (e.g. `/\$\d/`) appears and that "Economy" and "Express" rows render. Assert submitting weight `0` shows a validation error.
- [ ] **Step 2: FAIL → Step 3: implement (zod schema: positive numbers, required country) → Step 4: PASS.**
- [ ] **Step 5: Commit** `feat: add shipping calculator page`.

### Task 17: FAQ (`/faq`)
Accordion (Task 11) grouped by category (Getting started, Shipping & customs, Storage & fees, Account). Content in `faq` namespace as an array of `{q, a}`. Smoke test asserts a question renders and toggles open on click. → commit `feat: add FAQ page`.

### Task 18: About (`/about`)
Company story, mission, values, simple stats band. → commit `feat: add about page`.

### Task 19: Contact (`/contact`)
Form (react-hook-form + zod: name, email, message; email format validated). On submit (mock) show a success toast/inline confirmation and reset. Sidebar with email, business hours, address. Test: invalid email shows error; valid submit shows confirmation. → commit `feat: add contact page`.

### Task 20: Terms (`/terms`) & Privacy (`/privacy`)
Two static long-form pages with headings and placeholder legal copy clearly marked as draft. Shared simple `LegalPage` layout component optional. → commit `feat: add terms and privacy pages`.

---

## Phase 4 — Authentication

### Task 21: Login (`/login`)
**Files:** `src/pages/auth/Login.tsx`, `Login.test.tsx`. Centered card, `PublicLayout` (or minimal auth layout). Fields: email, password (react-hook-form + zod). On submit call `authService.login`; on success `navigate('/app')`; on error show inline message. Link to `/signup` and `/forgot`. Test: failed login (no user) shows error; successful login (after seeding via authService) navigates. → commit `feat: add login page`.

### Task 22: Register (`/signup`)
Fields: name, email, country (select), password + confirm (zod: min length, passwords match), accept terms checkbox (required). On success call `authService.register` then `navigate('/app')`. Password strength hint. Test: mismatched passwords show error; valid submit navigates. → commit `feat: add signup page`.

### Task 23: Forgot password (`/forgot`) & Email verification (`/verify`)
`/forgot`: email field, on submit show "check your inbox" confirmation (mock). `/verify`: static confirmation screen with a "Continue to dashboard" button. Smoke tests each. → commit `feat: add password recovery and email verification screens`.

---

## Phase 5 — Dashboard (mock data)

### Task 24: DashboardLayout with sidebar nav
**Files:** update `src/layouts/DashboardLayout.tsx`; wrap dashboard routes in `<ProtectedRoute>` inside `routes.tsx`.
Sidebar links: Overview `/app`, US Address `/app/address`, Inbox `/app/inbox`, Consolidate `/app/ship`, Shipments `/app/shipments`, Personal Shopper `/app/shopper`, Account `/app/account`. Top bar: brand, `LanguageSwitcher`, user name, Sign out (`authService.logout()` → `/`). Mobile: collapsible sidebar. Smoke test renders a sidebar link. → commit `feat: add dashboard layout with protected routes`.

### Task 25: Mock data
**Files:** `src/mocks/packages.ts`, `src/mocks/shipments.ts`, `src/mocks/address.ts`.
Typed fixtures: US address (name, suite, street, city, state, zip), 4–6 packages (`{id, store, description, weightKg, receivedDate, status: 'in_box'|'ready', photoUrl}`), 2–3 shipments (`{id, date, carrier, trackingCode, status, items}`). No commit alone — commit with Task 26 or standalone `chore: add dashboard mock data`.

### Task 26: Overview (`/app`)
Welcome header (user name from session), **US address card** (with copy button), three stat tiles (in box / in transit / delivered — counts from mocks), recent activity list. Smoke test renders address + a stat. → commit `feat: add dashboard overview`.

### Task 27: My US Address (`/app/address`)
Full address block, each line with copy-to-clipboard, suite number highlighted, instructions on how to use it when shopping. Test: clicking copy calls `navigator.clipboard.writeText` (mock it). → commit `feat: add US address page`.

### Task 28: Inbox (`/app/inbox`)
Table/cards of packages from mocks (store, description, weight, date, status badge, photo thumb). Checkbox selection; a "Consolidate selected" button routes to `/app/ship` with selected ids (via router state). Empty state. Test: renders a package row; selecting enables the button. → commit `feat: add inbox page`.

### Task 29: Consolidate & Ship (`/app/ship`)
Step flow (single page, sectioned): (1) selected packages summary, (2) destination + carrier choice powered by `estimateShipping` totals, (3) customs declaration form (item description, value) with zod, (4) cost summary, (5) "Place order" mock → success screen adding a shipment to a local list. Test: renders summary and a cost; place order shows confirmation. → commit `feat: add consolidate-and-ship flow`.

### Task 30: Shipments (`/app/shipments`)
List of past shipments from mocks with status badges and a tracking code (copyable). Detail expand shows items. → commit `feat: add shipments history page`.

### Task 31: Personal Shopper (`/app/shopper`)
Request form (react-hook-form + zod: product URL, quantity, notes, max budget). Submit shows a mock "request received" confirmation and appends to a local requests list. → commit `feat: add personal shopper request page`.

### Task 32: Account (`/app/account`)
Profile section (name, email, country — prefilled from session), language preference (uses i18n), notification toggles (local state), delivery addresses list (add/remove, local). Save shows confirmation. → commit `feat: add account settings page`.

---

## Phase 6 — Polish & Verify

### Task 33: Responsiveness & accessibility pass
Verify each page at mobile (375px) and desktop widths. Ensure: header hamburger works, tables scroll on mobile, focus states visible, images have `alt`, forms have labels, color contrast on navy/brand meets AA. Fix issues. → commit `fix: responsive and a11y polish`.

### Task 34: SEO + build verification
Add per-page `<title>`/meta via a small `usePageMeta` hook or `react-helmet-async`. Ensure `lang` attribute follows i18n language. Run `npm run build` (must pass), `npm test` (all green). Manual smoke via `npm run preview`. → commit `feat: add page metadata and finalize build`.

---

## Self-Review Notes (author)
- **Spec coverage:** All 21 spec screens map to tasks 12–32; transversal items (i18n, header/footer, responsive/a11y/SEO) map to tasks 4, 9–10, 33–34; isolation layer to tasks 6–7; security/validation via zod in tasks 16, 19, 21, 22, 29, 31. ✅
- **Type consistency:** `estimateShipping`/`EstimateInput`/`EstimateResult` (Task 6) reused in 16 & 29; `authService` methods (Task 7) reused in 8, 21, 22, 24, 26, 32. Names consistent. ✅
- **No placeholders in logic tasks;** presentational tasks intentionally specify structure + acceptance per the stated plan convention. ✅
