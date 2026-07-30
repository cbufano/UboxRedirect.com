# Fase 6 — App Mobile (Expo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um app mobile funcional (Expo/React Native + TypeScript) para o cliente final, reaproveitando o MESMO backend Supabase (schema, RLS, Edge Functions) já usado pelo site — sem nenhuma mudança de banco. Cobre a jornada central do cliente: login/cadastro, endereço americano + suite, pré-alerta de compra, caixa de entrada de pacotes, consolidação/envio, pagamento via Stripe Checkout, e privacidade/LGPD.

**Arquitetura:** Projeto Expo independente em `mobile/` (package.json próprio, não afeta o build do site em `src/`). Navegação por `expo-router` (file-based, com suporte a `--web` que permite testar em navegador Chrome sem simulador/dispositivo físico — usado para validação visual neste ambiente). Sessão persistida via `@react-native-async-storage/async-storage`. Camada de serviços em `mobile/src/services/*.ts` espelha 1:1 as convenções já estabelecidas em `src/services/*.ts` do site (mesma forma de erro `throw new Error(error.message)`, mesmo mapeamento camelCase, mesmas tabelas/RLS) — mas reescrita do zero porque o código do site usa `import.meta.env` (Vite) e `react-router-dom`, incompatíveis com o Metro bundler do Expo.

**Escopo explicitamente FORA desta entrega (documentar, não fingir):**
- Publicação nas lojas (Apple App Store / Google Play) — exige contas de desenvolvedor pagas do usuário (ver checklist manual no roadmap).
- Recuperação de senha ("esqueci minha senha") no app — cliente usa o site para isso neste v1; app mostra um link/instrução.
- i18n (pt/es) no app — v1 é inglês apenas, para não triplicar esforço de tradução sem conseguir testar em dispositivo real. Documentar como pendência de v2.
- Deep-link de retorno do Stripe Checkout para dentro do app — o Edge Function `create-checkout-session` usa o header `Origin` da requisição para montar `success_url`/`cancel_url`; chamadas mobile não têm esse header do jeito que um browser tem, então o retorno cai no fallback `https://uboxredirect.com/app/shipments?payment=...` (o site). O app abre o checkout num browser in-app (`expo-web-browser`) e, ao voltar ao app (evento de `AppState` voltando para `active`), refaz a busca de consolidações para refletir o pagamento — sem precisar mexer no Edge Function compartilhado com o site.
- Testes de componente/tela (`@testing-library/react-native`) — dado o esforço, os testes automatizados cobrem a camada de serviços (onde os bugs reais já apareceram nas fases anteriores); a verificação visual das telas é feita manualmente via `expo start --web` neste ambiente.

**Tech Stack:** Expo SDK 57 (managed), TypeScript, expo-router, `@supabase/supabase-js` (mesma versão do site, `^2.111.0`), `@react-native-async-storage/async-storage`, `expo-web-browser`, `react-hook-form` + `zod` (mesmas versões do site), Jest + `jest-expo` para os testes de serviço.

---

## Task 1: Scaffold do projeto Expo + tooling

**Files:**
- Create: `mobile/` (projeto Expo TS completo via `create-expo-app`)
- Create: `mobile/app/_layout.tsx`, `mobile/app/(tabs)/_layout.tsx`, `mobile/app/(tabs)/index.tsx` (placeholder)
- Create: `mobile/.env.example`
- Create: `mobile/jest.config.js` (ou config em `package.json`)
- Modify: repo-root `.gitignore` (adicionar `mobile/node_modules`, `mobile/.expo`, `mobile/.env`)

- [ ] **Step 1: Criar o projeto**

```bash
cd D:/A-Sites_Lovable_React/PROJETO_UBOX
npx create-expo-app@latest mobile --template blank-typescript
cd mobile
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar
npm install @supabase/supabase-js@^2.111.0 @react-native-async-storage/async-storage expo-web-browser react-hook-form@^7.83.0 zod@^4.4.3 @hookform/resolvers@^5.5.7
npm install --save-dev jest-expo @types/jest
```

- [ ] **Step 2: Configurar expo-router como entry point**

Em `mobile/package.json`, confirmar/ajustar:
```json
{
  "main": "expo-router/entry"
}
```

Criar `mobile/app.json` com o plugin de router (o `create-expo-app` moderno já inclui isso por padrão na versão instalada — só confirmar que `"scheme": "bufanoredirect"` está definido, usado futuramente por deep links).

- [ ] **Step 3: Layout raiz mínimo e uma aba placeholder**

`mobile/app/_layout.tsx`:
```tsx
import { Stack } from 'expo-router'

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
```

`mobile/app/(tabs)/_layout.tsx`:
```tsx
import { Tabs } from 'expo-router'

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Overview' }} />
    </Tabs>
  )
}
```

`mobile/app/(tabs)/index.tsx`:
```tsx
import { Text, View } from 'react-native'

export default function Overview() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Bufano Redirect</Text>
    </View>
  )
}
```

- [ ] **Step 4: Verificar que o app sobe em modo web**

```bash
cd mobile
npx expo start --web
```

Abrir a URL local no Chrome (via ferramentas de browser) e confirmar que a tela placeholder "Bufano Redirect" renderiza sem erro no console.

- [ ] **Step 5: Configurar Jest**

`mobile/jest.config.js`:
```js
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
}
```
Em `mobile/package.json`, adicionar script `"test": "jest"`.

- [ ] **Step 6: `.env.example` e `.gitignore`**

`mobile/.env.example`:
```
EXPO_PUBLIC_SUPABASE_URL=https://iyxgrvqvthuvvxautrgm.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Adicionar ao `.gitignore` da raiz do repo: `mobile/node_modules`, `mobile/.expo`, `mobile/.env`.

- [ ] **Step 7: Commit**

```bash
git add mobile/ .gitignore
git commit -m "feat(mobile): scaffold Expo app with router, tabs shell, and Jest"
```

---

## Task 2: Supabase client + authService + AuthContext + telas de auth

**Files:**
- Create: `mobile/src/lib/supabase.ts`
- Create: `mobile/src/services/authService.ts`, `mobile/src/services/authService.test.ts`
- Create: `mobile/src/contexts/AuthContext.tsx`
- Create: `mobile/src/components/ui/{Button,Card,TextField}.tsx`
- Create: `mobile/app/(auth)/login.tsx`, `mobile/app/(auth)/signup.tsx`
- Modify: `mobile/app/_layout.tsx` (auth gate: redireciona para `(auth)/login` se não autenticado, para `(tabs)` se autenticado)

- [ ] **Step 1: Cliente Supabase com sessão persistida via AsyncStorage**

`mobile/src/lib/supabase.ts`:
```ts
import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — copy mobile/.env.example to mobile/.env and fill it in.',
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
```
Rodar `npx expo install react-native-url-polyfill` (necessário para o supabase-js em RN).

- [ ] **Step 2: authService (mobile)**

`mobile/src/services/authService.ts` — mesma forma pública de `src/services/authService.ts` do site (`User`, `RegisterInput`, `RegisterResult`, `register`, `login`, `logout`, `getSession`, `onAuthStateChange`), com duas diferenças deliberadas:
- `register` NÃO envia `emailRedirectTo` (não há `window.location` em RN; cai no Site URL padrão configurado no dashboard do Supabase).
- Sem `requestPasswordReset`/`updatePassword` — fora de escopo do v1 mobile (ver nota no cabeçalho do plano).

```ts
import { supabase } from '../lib/supabase'
import type { User as SupabaseUser } from '@supabase/supabase-js'

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

function assertNoAuthError(error: { message: string } | null): void {
  if (error) throw new Error(error.message, { cause: error })
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
          terms_version: '2026-07-29',
        },
      },
    })
    assertNoAuthError(error)
    return { user: mapUser(result.user), needsEmailConfirmation: !result.session }
  },

  async login(email: string, password: string): Promise<User> {
    const { data: result, error } = await supabase.auth.signInWithPassword({ email, password })
    assertNoAuthError(error)
    const user = mapUser(result.user)
    if (!user) throw new Error('Invalid credentials')
    return user
  },

  async logout(): Promise<void> {
    await supabase.auth.signOut()
  },

  async getSession(): Promise<User | null> {
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      console.error('authService.getSession failed:', error.message)
      return null
    }
    return mapUser(data.session?.user)
  },

  onAuthStateChange(callback: (user: User | null) => void): () => void {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(mapUser(session?.user))
    })
    return () => data.subscription.unsubscribe()
  },
}
```

- [ ] **Step 2b: Teste do authService**

`mobile/src/services/authService.test.ts` — portar os casos de `src/services/authService.test.ts` que ainda se aplicam (`register` monta metadata corretamente e não envia `emailRedirectTo`; `login` mapeia usuário; `login` lança com credenciais inválidas; `getSession` retorna `null` e loga em erro; `onAuthStateChange` repassa usuário mapeado). Mockar `../lib/supabase` como no site.

- [ ] **Step 3: AuthContext (idêntico em estrutura ao do site)**

`mobile/src/contexts/AuthContext.tsx` — cópia estrutural de `src/contexts/AuthContext.tsx`, importando o `authService` local.

- [ ] **Step 4: Primitivos de UI mínimos**

`mobile/src/components/ui/Button.tsx`, `Card.tsx`, `TextField.tsx` — `Pressable`/`View`/`TextInput` com `StyleSheet`, paleta reaproveitando os tokens do site (`navy #0B1F3A`, `brand/blue #1E88E5`, `offwhite #F5F7FA`, `slate #0F172A`, `success #16A34A`). `TextField` aceita `label`, `error`, e repassa o resto das props para `TextInput` (equivalente ao `Input.tsx` do site).

- [ ] **Step 5: Telas de login e cadastro**

`mobile/app/(auth)/login.tsx` — formulário `react-hook-form`+`zod` (email + senha), chama `authService.login`, em sucesso `router.replace('/(tabs)')`, em erro mostra mensagem inline. Link/texto para `(auth)/signup`.

`mobile/app/(auth)/signup.tsx` — mesmo padrão para nome/email/país/senha, chama `authService.register`; se `needsEmailConfirmation`, mostra tela de "confira seu e-mail" em vez de navegar.

- [ ] **Step 6: Auth gate no layout raiz**

`mobile/app/_layout.tsx` usa `useAuth()` dentro de um `AuthProvider` envolvendo tudo; enquanto `loading`, mostra um `ActivityIndicator`; senão, `expo-router`'s `Redirect` para `/(auth)/login` ou `/(tabs)` conforme `user`.

- [ ] **Step 7: Verificar visualmente**

`npx expo start --web`, abrir no Chrome, testar cadastro + login com um usuário de teste real do Supabase (mesma base do site), confirmar redirecionamento para a aba placeholder.

- [ ] **Step 8: Rodar testes e commit**

```bash
cd mobile && npx jest && npx tsc --noEmit
git add mobile/
git commit -m "feat(mobile): auth (Supabase client, authService, login/signup, auth gate)"
```

---

## Task 3: profileService + packageService (leitura) + tela Overview

**Files:**
- Create: `mobile/src/services/profileService.ts`, `.test.ts`
- Create: `mobile/src/services/packageService.ts`, `.test.ts` (só as funções de leitura + `createExpectedPackage`/`cancelExpectedPackage` nesta task; `createConsolidation`/`addConsolidationItems` ficam para a Task 5)
- Create: `mobile/src/config/warehouse.ts`, `mobile/src/lib/address.ts` (cópia direta de `src/config/warehouse.ts`/`src/lib/address.ts` — são funções puras, sem dependência de DOM)
- Modify: `mobile/app/(tabs)/index.tsx` (Overview real)

- [ ] **Step 1: profileService — porta 1:1 de `src/services/profileService.ts`** (mesmas funções `getMyProfile`/`updateMyProfile`, mesmo mapeamento).

- [ ] **Step 2: packageService (parcial) — porta de `src/services/packageService.ts`**: tipos `ExpectedPackage`, `ReceivedPackage`, `Consolidation`; funções `createExpectedPackage`, `getMyExpectedPackages`, `getMyReceivedPackages`, `getMyConsolidations`, `cancelExpectedPackage`. (`createConsolidation`/`addConsolidationItems` entram na Task 5, junto com o `rateService` que os usa.)

- [ ] **Step 3: `mobile/src/config/warehouse.ts` e `mobile/src/lib/address.ts`** — cópia exata dos arquivos do site (são TypeScript puro, sem imports de DOM/React).

- [ ] **Step 4: Tela Overview** (`mobile/app/(tabs)/index.tsx`) — `useEffect` com `Promise.all([profileService.getMyProfile(), packageService.getMyReceivedPackages(), packageService.getMyConsolidations()])`, mesma semântica de stat tiles já usada em `src/pages/dashboard/Overview.tsx` (inBox = received/in_review, inTransit = paid/shipped, delivered = delivered), cartão de endereço via `formatUsAddress`, estado de loading/erro (`ActivityIndicator`/texto de erro).

- [ ] **Step 5: Testes dos dois services** (mirror dos testes do site, adaptando mocks para Jest).

- [ ] **Step 6: Verificar visualmente** — logar no app (via `expo start --web`) e confirmar que a aba Overview mostra a suite real e os números corretos para o usuário de teste.

- [ ] **Step 7: Rodar testes e commit.**

---

## Task 4: Pré-alerta (NotifyPurchase) + Inbox (visualizar/selecionar pacotes)

**Files:**
- Create: `mobile/app/(tabs)/inbox.tsx`
- Create: `mobile/app/(tabs)/notify-purchase.tsx` (ou rota modal `mobile/app/notify-purchase.tsx` aberta a partir da Inbox)
- Modify: `mobile/app/(tabs)/_layout.tsx` (adicionar aba Inbox)

- [ ] **Step 1: Tela de pré-alerta** — formulário (loja, código de rastreio, descrição, valor declarado) chamando `packageService.createExpectedPackage`; lista dos pré-alertas existentes (`getMyExpectedPackages`) com opção de cancelar (`cancelExpectedPackage`) quando `status === 'pending'`. Segue o padrão já corrigido no site: os botões de ação do formulário não ficam bloqueados pelo loading da lista (mesmo bug já corrigido em `NotifyPurchase.tsx` do site — replicar a correção, não o bug).

- [ ] **Step 2: Tela Inbox** — lista `getMyReceivedPackages()`, badge de status nas mesmas 6 cores/rótulos usados em `src/pages/dashboard/Inbox.tsx` (`received`/`in_review`: cinza, `ready`: verde, `consolidating`: âmbar, `shipped`: azul, `discarded`: vermelho), seleção múltipla habilitada só para `status === 'ready'`, botão "Consolidar" navega para a tela de Ship (Task 5) passando os ids selecionados via params de rota do expo-router.

- [ ] **Step 3: Verificar visualmente e commit** (com testes, se a lógica de seleção tiver ramificação não trivial — extrair para uma função pura testável em vez de testar via render de componente, dado que este plano não inclui testes de componente RN).

---

## Task 5: rateService + tela Ship (criar consolidação)

**Files:**
- Create: `mobile/src/services/rateService.ts`, `.test.ts`
- Modify: `mobile/src/services/packageService.ts` (adicionar `createConsolidation`, `addConsolidationItems`, `CreateConsolidationInput` — cópia 1:1 do site)
- Create: `mobile/app/ship.tsx` (rota fora das tabs, navegada a partir da Inbox)

- [ ] **Step 1: rateService** — cópia 1:1 de `src/services/rateService.ts` (é puro TS + chamada Supabase, sem dependência de DOM).

- [ ] **Step 2: Completar packageService** com `createConsolidation`/`addConsolidationItems` (cópia 1:1 do site).

- [ ] **Step 3: Tela Ship** — recebe os ids selecionados (via params de rota), mostra resumo dos pacotes + peso total, formulário de endereço de destino (país via um seletor simples, rua/cidade/estado/CEP), calcula estimativa via `rateService.estimateShippingCost` num `useEffect` reagindo a país+peso (mesma lógica de `src/pages/dashboard/Ship.tsx`), escolha de transportadora, formulário de aduaneira (descrição + valor declarado), submit cria a consolidação + os itens, mostra confirmação.

- [ ] **Step 4: Testes do rateService** (mirror do site).

- [ ] **Step 5: Verificar visualmente** o fluxo completo Inbox → selecionar → Ship → confirmar, no `expo start --web`.

- [ ] **Step 6: Commit.**

---

## Task 6: paymentService + tela Shipments (pagar via Stripe Checkout)

**Files:**
- Create: `mobile/src/services/paymentService.ts`
- Create: `mobile/app/(tabs)/shipments.tsx`
- Modify: `mobile/app/(tabs)/_layout.tsx` (adicionar aba Shipments)

- [ ] **Step 1: paymentService** — cópia 1:1 de `src/services/paymentService.ts` (`createCheckoutSession` via `supabase.functions.invoke`).

- [ ] **Step 2: Tela Shipments** — lista `getMyConsolidations()`, badges de status (mesmas 5 cores do site), botão "Pay now" para status `pending` que chama `paymentService.createCheckoutSession` e abre a URL retornada com `WebBrowser.openBrowserAsync` (import de `expo-web-browser`). Ao voltar o app para foreground (`AppState.addEventListener('change', ...)` filtrando transição para `'active'`), refaz `getMyConsolidations()` para refletir o pagamento — não há deep link de volta (ver nota de escopo no cabeçalho do plano), então o refresh no foreground é o mecanismo real de atualização.

- [ ] **Step 3: Verificar visualmente** — como o Stripe real não está implantado ainda (ver checklist manual do roadmap), validar só o caminho de erro (`createCheckoutSession` falhando com a function não implantada deve mostrar o alerta de erro, não travar a tela) — documentar explicitamente que o caminho de sucesso do pagamento só pode ser testado ponta-a-ponta depois que alguém implantar as Edge Functions com credenciais Stripe reais (mesma pendência já listada no roadmap para o site).

- [ ] **Step 4: Commit.**

---

## Task 7: privacyService + tela Privacy (LGPD/GDPR)

**Files:**
- Create: `mobile/src/services/privacyService.ts`, `.test.ts`
- Create: `mobile/app/(tabs)/privacy.tsx`
- Modify: `mobile/app/(tabs)/_layout.tsx` (adicionar aba Privacy)

- [ ] **Step 1: privacyService** — cópia 1:1 de `src/services/privacyService.ts` (`submitDataRequest`, `getMyDataRequests`).

- [ ] **Step 2: Tela Privacy** — explicação curta dos direitos LGPD/GDPR, dois botões (exportar / excluir) cada um abrindo um painel de confirmação com nota opcional, histórico dos pedidos com status. Replicar o mesmo cuidado já corrigido no site: os botões de ação não ficam bloqueados pelo loading do histórico.

- [ ] **Step 3: Teste do privacyService** (mirror do site).

- [ ] **Step 4: Verificar visualmente e commit.**

---

## Task 8: Navegação final, polish e fechamento

**Files:**
- Modify: `mobile/app/(tabs)/_layout.tsx` (ícones das 5 abas: Overview, Inbox, Ship*, Shipments, Privacy — *Ship fica fora das tabs por ser um fluxo, não um destino permanente; confirmar que a navegação para lá a partir da Inbox continua funcionando)
- Create: `mobile/README.md`
- Modify: `docs/SISTEMA-E-ROADMAP.md` (banner de status da Fase 6 + entradas no checklist manual)

- [ ] **Step 1: Ícones e polish visual das abas** (usar `@expo/vector-icons`, já incluso no template do Expo — `npx expo install @expo/vector-icons` se necessário).

- [ ] **Step 2: `mobile/README.md`** — como rodar (`npx expo start --web` / `--ios` / `--android`), variáveis de ambiente necessárias, e um link para a seção de checklist manual do roadmap.

- [ ] **Step 3: Rodar a suíte inteira do mobile** (`cd mobile && npx jest && npx tsc --noEmit`) e a suíte do site (`cd .. && npx vitest run && npx tsc -b --noEmit && npx oxlint`) para confirmar que nada foi quebrado no monorepo.

- [ ] **Step 4: Atualizar `docs/SISTEMA-E-ROADMAP.md`** com banner de status da Fase 6 (o que foi entregue, o que ficou de fora) e novas entradas no "Checklist manual consolidado": conta Apple Developer (US$99/ano) e Google Play Console (US$25 único) para publicação nas lojas, `eas build`/`eas submit` (requer conta EAS/Expo), ícone e splash screen definitivos da marca, decisão sobre i18n no app (v2), revisão do fluxo de pagamento mobile assim que o Stripe real estiver implantado.

- [ ] **Step 5: Commit final.**

---

## Decisões em aberto específicas do mobile (para o usuário decidir quando puder)

1. Nome/bundle id definitivo do app nas lojas (ex.: `com.bufanoredirect.app`) e nome de exibição.
2. Se vale a pena investir em deep link de retorno do Stripe (exigiria adaptar o Edge Function compartilhado para aceitar um `platform` no corpo da requisição e escolher `success_url`/`cancel_url` com esquema customizado quando vier do mobile).
3. Prioridade de i18n no app (hoje só inglês) vs. outras telas/funcionalidades.
