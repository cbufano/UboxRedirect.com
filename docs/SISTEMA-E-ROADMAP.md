# Bufano Redirect — Estado Atual do Sistema e Roadmap Completo

> **Empresa:** Bufano Redirect — redirecionamento de encomendas (package forwarding) sediada em Miami/Doral, FL, EUA.
> **Repositório:** https://github.com/cbufano/UboxRedirect.com
> **Data deste documento:** 29/07/2026

> **Atualização 29/07/2026 — Fase 2 entregue:** auth real (Supabase Auth + Postgres com RLS em 100% das tabelas), suite gerada automaticamente no cadastro, fluxo completo de recuperação de senha, e o painel (`Address`, `Overview`, `Account`) lendo dados reais via `profileService`. Plano de execução em `docs/superpowers/plans/2026-07-29-fase2-supabase-backend.md`. Pendências manuais para produção estão listadas no fim deste documento.

> **Atualização 30/07/2026 — Fase 3 entregue:** pré-alerta de compra (`expected_packages`), recebimento e triagem de pacotes no galpão (`packages`, com fotos em Storage), consolidação de pacotes em envios (`consolidations`/`consolidation_items`), cotação de frete real (`rate_tables`), e painel admin/ops (fila de pacotes, fila de consolidações, visão geral operacional) com separação de papéis (`customer`/`ops`/`support`/`admin`/`super_admin`) via RLS. `Inbox`, `Ship`, `Calculator`, `Shipments` e `Overview` (este último fechado em 30/07) já leem tudo de dados reais — nenhuma página do painel do cliente usa mais `src/mocks/*`.

> **Atualização 30/07/2026 — Fase 4 entregue:** pagamento via Stripe Checkout (hospedado, sem Stripe Elements no cliente). Edge Functions `create-checkout-session` (recalcula o preço no servidor a partir do peso real + tabela de tarifas, nunca confia no valor enviado pelo cliente) e `stripe-webhook` (confirma pagamento via assinatura Stripe, idempotente). Código completo em `supabase/functions/`; **implantação real pendente** (requer conta Stripe de verdade — ver checklist manual no fim deste documento).

> **Atualização 30/07/2026 — Fase 5 entregue:** autoatendimento LGPD/GDPR (`/app/privacy` — cliente solicita exportação/exclusão de dados, `data_requests`) com fila de resolução para staff (`/admin/data-requests`); campos de status de KYC/OFAC em `profiles`, marcados manualmente por staff direto na tela de recebimento de pacote. A revisão de segurança encontrou um achado **Crítico**: faltava a policy de RLS que permitisse staff atualizar `profiles` de outro usuário — `setKycStatus`/`setOfacStatus` reportavam sucesso na tela sem gravar nada no banco. Corrigido e aplicado em produção (migration `20260730000005_profiles_staff_update_policy.sql`). Triagem OFAC/SDN automática e KYC via Stripe Identity **não foram construídos** — são apenas os campos de status manuais, como documentado desde a migration original.

> **Atualização 30/07/2026 — Fase 7 / Onda 7.1 entregue (operação física do warehouse):** endereçamento físico completo (`warehouse_locations`, código `G-A-01-1-01`, geração de grade em massa admin-only, sugestão automática de posição livre, histórico de movimentação por trigger); recebimento v2 com match de pré-alerta em 1 clique, dimensões, foto e **etiqueta de estoque 4×6" com QR code** (aponta para a ficha do pacote); ficha do pacote em `/admin/packages/:id` (mover posição, histórico, reimprimir etiqueta, aprovar/descartar); tela `/admin/warehouse` com mapa de ocupação colorido; expedição agora só embala consolidações **pagas**, com lista de coleta ordenada por posição e conferência por scan de QR (override explícito). Revisão final: aprovada sem achados Críticos/Importantes; 2 dos 7 Menores corrigidos na hora (contagem da geração de grade e anti-0-linhas em `markPackageReady`), migrations aplicadas em produção. Spec completa da fase em `docs/superpowers/specs/2026-07-30-fase7-back-office-spec.md`; próximas ondas: 7.2 (pendências & dinheiro), 7.3 (pessoas), 7.4 (automação).

> **Atualização 30/07/2026 — Fase 6 entregue:** app mobile (Expo/React Native + TypeScript, projeto independente em `mobile/`, expo-router) reaproveitando o mesmo backend Supabase do site (schema, RLS, Edge Functions), sem nenhuma mudança de banco. Cobre a jornada central do cliente em 5 telas — Overview, Notify Purchase (pré-alerta), Inbox (com seleção múltipla → consolidação em `ship.tsx`), Shipments (pagamento via Stripe Checkout aberto em browser in-app) e Privacy (LGPD/GDPR) — mais um fluxo completo de login/cadastro (auth gate). Camada de serviços em `mobile/src/services/*.ts` espelha 1:1 as convenções do site, testada com Jest/`jest-expo` (76 testes). Plano de execução em `docs/superpowers/plans/2026-07-30-fase6-mobile-app.md`. **Fora do escopo do v1:** publicação nas lojas (Apple App Store / Google Play), i18n (pt/es) no app, recuperação de senha dentro do app, e deep-link de retorno do Stripe Checkout (o app refaz a busca de consolidações ao voltar ao primeiro plano, sem navegação automática via deep link). Ver `mobile/README.md` e o checklist manual no fim deste documento.

---

# PARTE 1 — O que já foi construído

## 1.1 Stack técnica atual

| Camada | Tecnologia | Versão |
|---|---|---|
| Build | Vite | 8 |
| UI | React + TypeScript | 19 / 6.0 |
| Estilo | Tailwind CSS (CSS-first, plugin Vite) | 4 |
| Rotas | React Router (com code-splitting/lazy) | 7 |
| Idiomas | react-i18next + i18next (EN / PT / ES) | 17 / 26 |
| Formulários | react-hook-form + zod | 7 / 4 |
| Ícones | lucide-react | 1 |
| Testes | Vitest + React Testing Library (todas as páginas têm teste) | 4 |
| Lint | oxlint | 1 |
| Deploy | GitHub Actions → FTP → Hostinger (workflow criado, **push pendente + secrets FTP**) | — |

**Design tokens:** `navy #0B1F3A`, `blue #1E88E5`, `offwhite #F5F7FA`, `slate #0F172A`, `success #16A34A`.

## 1.2 Site institucional (público)

Todas multilíngues (EN/PT/ES), com SEO (`DocumentMeta`), responsivas e acessíveis:

- **Home** (`/`) — hero, proposta de valor, CTAs
- **Como Funciona** (`/how`)
- **Preços** (`/pricing`)
- **Serviços** (`/services`)
- **Calculadora de frete** (`/calculator`) — usa `shippingEstimator` (peso cubado, divisor 5000, tarifas por zona BR/US/default, opções Economy e Express)
- **FAQ** (`/faq`)
- **Contato** (`/contact`)
- **Sobre** (`/about`)
- **Termos** (`/terms`) e **Privacidade** (`/privacy`) — texto placeholder, precisa de revisão jurídica

## 1.3 Autenticação (MOCK — não é produção)

Páginas: **Login, Cadastro, Esqueci a senha, Verificação** (`/login`, `/signup`, `/forgot`, `/verify`).

`authService` é uma camada de isolamento em `localStorage`: registro, login, logout e sessão funcionam **apenas no navegador**, com senha em texto puro (documentado como mock). A interface pública (`register/login/logout/getSession`) foi desenhada para trocar o interno por um backend real **sem tocar na UI**.

## 1.4 Painel do usuário (`/app`, protegido por `ProtectedRoute`)

Todos alimentados por dados mock (`src/mocks/`):

- **Overview** — resumo da conta
- **Meu Endereço US** — endereço do galpão em Doral/FL com suite pessoal (ex.: `BUF-10482`) e botão de copiar
- **Inbox** — pacotes recebidos no galpão (loja, descrição, peso, status `in_box`/`ready`)
- **Enviar** (`/app/ship`) — montagem de envio
- **Meus Envios** — histórico (carrier, tracking, status `processing`/`in_transit`/`delivered`, custo)
- **Personal Shopper** — solicitação de compra assistida
- **Conta** — dados do usuário

## 1.5 Infra e qualidade

- Testes unitários/smoke em **todas** as páginas e serviços
- CI de deploy (`.github/workflows/deploy.yml`): testa → builda → envia `dist/` por FTP para `public_html/` da Hostinger
- `.htaccess` de SPA para as rotas do React Router
- Plano e spec de design da Fase 1 em `docs/superpowers/`

**Resumo honesto:** hoje é um site institucional excelente com um *protótipo funcional* de painel. Não há backend, banco, pagamento, admin nem segurança real — tudo isso é a Parte 2.

---

# PARTE 2 — Proposta: o que falta para virar um sistema top

## 2.1 Arquitetura alvo

```
┌────────────────┐     ┌──────────────────────────── SUPABASE ───────────────────────────┐
│  Site React    │────▶│ Auth (e-mail+senha, OAuth, MFA)                                  │
│  (usuário)     │     │ Postgres + RLS (Row Level Security)                              │
├────────────────┤     │ Storage (fotos de pacotes, documentos KYC)                       │
│  Painel Admin  │────▶│ Edge Functions (pagamentos, webhooks, e-mails, cotação real)     │
│  (equipe)      │     │ Realtime (notificações de pacote recebido)                       │
├────────────────┤     └───────────────┬──────────────────────────────────────────────────┘
│  App mobile    │                     │ webhooks/API
│  (fase futura) │            ┌────────┴─────────┐   ┌──────────────┐   ┌───────────────┐
└────────────────┘            │ Stripe (US)      │   │ EasyPost/    │   │ Resend/Postmark│
                              │ + dLocal/EBANX   │   │ Shippo (fretes│  │ (e-mails)      │
                              │ (Pix p/ Brasil)  │   │ e etiquetas) │   └───────────────┘
                              └──────────────────┘   └──────────────┘
```

**Princípio central:** o frontend nunca decide nada sensível. Preço, cobrança, status e permissões são calculados/validados no servidor (Postgres + Edge Functions). O `authService` e o `shippingEstimator` atuais são exatamente os pontos de troca.

## 2.2 Banco de dados — Supabase (Postgres)

### Tabelas principais

| Tabela | Conteúdo | Observações |
|---|---|---|
| `profiles` | id (= auth.uid), nome, país, telefone, idioma, CPF/documento, status KYC | Estende `auth.users`; criada por trigger no signup |
| `roles` / `user_roles` | `customer`, `ops` (galpão), `support`, `admin`, `super_admin` | Papéis **nunca** em claims editáveis pelo cliente |
| `suites` | número da suite (BUF-XXXXX), user_id, status | Gerada automaticamente no cadastro |
| `destination_addresses` | endereços de entrega do cliente (BR, etc.) | Vários por usuário |
| `packages` | suite_id, loja, descrição, peso real, dimensões, valor declarado, status, recebido_em, recebido_por (ops) | Status: `expected → received → in_review → ready → consolidating → shipped → discarded` |
| `package_photos` | package_id, url no Storage | Fotos tiradas pelo galpão |
| `consolidations` | agrupamento de pacotes num envio único | Serviço-chave do negócio |
| `shipments` | user_id, endereço destino, carrier, serviço, tracking, peso cobrado, status, custos | Status com timeline |
| `shipment_items` | shipment_id ↔ package_id | |
| `quotes` | cotações geradas (input, opções, validade) | Auditoria de preço |
| `rate_tables` | tarifas por zona/carrier/faixa de peso | Editável só pelo admin — substitui as constantes do `shippingEstimator` |
| `payments` | stripe_payment_intent_id, valor, moeda, status, método | Fonte de verdade vem do **webhook**, nunca do cliente |
| `invoices` | fatura/recibo por envio ou serviço | |
| `wallet_ledger` (opcional) | créditos/estornos do cliente | Livro-razão imutável (só INSERT) |
| `shopper_orders` | pedidos de personal shopper (link, qtd, orçamento, taxa, status) | |
| `storage_fees` | cobrança de armazenagem após X dias grátis | Job diário (pg_cron) |
| `support_tickets` + `ticket_messages` | atendimento | |
| `notifications` | in-app + espelho do que foi enviado por e-mail/push | |
| `prohibited_items_log` | itens barrados na inspeção | Compliance de exportação |
| `audit_logs` | quem fez o quê, quando, de onde (ações de admin/ops) | Só INSERT; obrigatório p/ compliance |
| `consents` | aceite de termos/privacidade/marketing com versão e timestamp | LGPD/GDPR |
| `data_requests` | pedidos de exportação/exclusão de dados | LGPD/GDPR |

### Row Level Security (a regra de ouro)

- **RLS ligado em todas as tabelas, sem exceção.**
- Cliente: `user_id = auth.uid()` para SELECT nos seus dados; INSERT/UPDATE só onde fizer sentido (endereços, tickets); **nunca** UPDATE em `packages.weight`, `payments`, `shipments.status`.
- Ops/Admin: policies via função `has_role(auth.uid(), 'ops')` consultando `user_roles`.
- Mutações sensíveis (marcar pacote recebido, alterar tarifa, reembolsar) **só via Edge Functions** com service role + registro em `audit_logs`.

## 2.3 Pagamentos — Stripe (empresa em Miami)

**Recomendação: Stripe** — padrão de mercado nos EUA, aceita empresa registrada na Flórida (LLC/Inc + EIN), e resolve PCI-DSS (o cartão nunca toca seu servidor).

- **Métodos EUA/global:** cartão de crédito/débito, Apple Pay, Google Pay, Link, e **ACH Direct Debit** (barato para tickets altos).
- **Clientes no Brasil (seu público principal):** Stripe não processa **Pix** nativamente para conta US — integrar um segundo provedor para LatAm: **dLocal, EBANX ou PagBrasil** (Pix + boleto + cartão local em BRL). Arquitetura de pagamento com 2 provedores atrás de uma interface única `paymentService`.
- **Fluxo:** Edge Function `create-payment` cria o Payment Intent/Checkout Session server-side (preço recalculado no servidor, nunca aceito do cliente) → cliente paga → **webhook** `payment_succeeded` atualiza `payments` e libera o envio → recibo por e-mail.
- **Extras Stripe úteis:** Stripe Tax (sales tax da Flórida se aplicável), Radar (antifraude — essencial em forwarding, setor visado por fraude de cartão), Billing (assinaturas para planos de armazenagem premium), Identity (verificação de documento no KYC).
- **Regra inegociável:** status de pagamento só muda via webhook assinado (verificação de assinatura do Stripe) — nunca por chamada do frontend.

## 2.4 Separação Admin × Usuário (sem conflito)

**Dois "aplicativos" na mesma base, com fronteira dura:**

| | Usuário (`/app`) | Admin/Ops (`/admin`) |
|---|---|---|
| Quem | Cliente final | Equipe (papéis `ops`, `support`, `admin`, `super_admin`) |
| Acesso | E-mail+senha, OAuth, MFA opcional | **MFA obrigatório**, allowlist de e-mails corporativos |
| Vê | Só os próprios dados (RLS) | Conforme o papel |
| Faz | Endereços, pedir envio, pagar, tickets, shopper | Ver abaixo |

**Funcionalidades do Admin (novo, a construir):**

1. **Recebimento no galpão (Ops):** buscar suite, registrar pacote (loja, peso, dimensões, valor declarado), tirar/subir fotos, marcar `received` → dispara notificação ao cliente.
2. **Gestão de envios:** fila de pedidos pagos, consolidação física, compra de etiqueta (EasyPost/Shippo), inserir tracking, atualizar status.
3. **Clientes:** busca, histórico, suspensão, aprovação de KYC.
4. **Tarifas e preços:** editar `rate_tables`, taxas de serviço, dias grátis de armazenagem — com histórico (auditoria).
5. **Financeiro:** pagamentos, reembolsos (via Stripe, com dupla confirmação), relatório de receita.
6. **Suporte:** fila de tickets com SLA.
7. **Conteúdo:** editar FAQ/avisos sem deploy.
8. **Dashboards:** pacotes/dia, receita, ticket médio, tempo galpão→envio.
9. **Compliance:** fila de `data_requests` (exportar/excluir dados), log de itens proibidos.

**Anti-conflito na prática:** papéis vivem em `user_roles` (não no JWT editável), toda policy de admin verifica o papel no banco, rotas `/admin` têm guard próprio + verificação server-side em cada Edge Function (o guard de UI é cosmético — a segurança real é RLS + função).

## 2.5 Funcionalidades novas para o usuário (deixar o produto "top")

- **Notificações reais:** e-mail transacional (Resend/Postmark) + Realtime in-app: pacote recebido (com foto!), envio pago, tracking atualizado, armazenagem prestes a vencer.
- **Tracking unificado:** timeline do pacote da chegada ao galpão até a entrega (webhook do carrier via EasyPost/Shippo).
- **Consolidação self-service:** selecionar pacotes do Inbox → cotação real → escolher carrier → pagar → acompanhar.
- **Serviços extras por pacote:** fotos adicionais, reembalagem, remoção de nota, seguro, medição.
- **Declaração aduaneira guiada:** cliente declara conteúdo/valor por item (obrigatório p/ exportação; gera o CN22/commercial invoice).
- **Calculadora pública ligada às tarifas reais** (`rate_tables`) — mesma fonte que o checkout, sem surpresa de preço.
- **Indicação (referral):** crédito em `wallet_ledger` por indicação.
- **Onboarding pós-cadastro:** tour mostrando o endereço US e como preencher checkout nas lojas.

## 2.6 Segurança (sem vazamento)

**Camada de aplicação**
- Supabase Auth: senha com hash forte (nativo), verificação de e-mail obrigatória, política de senha, **MFA TOTP** (opcional p/ cliente, obrigatório p/ admin), rate limiting de login, CAPTCHA (Cloudflare Turnstile) em signup/login/contato.
- Sessão: tokens do Supabase (refresh rotativo); logout global; expiração curta p/ admin.
- Validação **zod dos dois lados** — no form e na Edge Function (nunca confiar no cliente).

**Camada de dados**
- RLS em 100% das tabelas (teste automatizado de policies no CI).
- Service role key **só** em Edge Functions (jamais no bundle do site).
- Storage com bucket privado + URLs assinadas com expiração para fotos/documentos.
- Backups automáticos (PITR no plano Pro do Supabase) + teste de restauração.
- Criptografia de campos ultra-sensíveis (documento de identidade) com pgsodium, se armazenados.

**Camada web**
- HTTPS + HSTS; headers `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` (no `.htaccess`/CDN).
- Sem segredo nenhum no frontend (só a anon key pública do Supabase, que é segura *por causa* do RLS).
- Dependabot/renovate + `npm audit` no CI; secrets só no GitHub Actions/Supabase Vault.
- `audit_logs` imutável para toda ação administrativa.

## 2.7 Compliance (LGPD, leis dos EUA e específicas do setor)

**Proteção de dados**
- **LGPD (Brasil)** — aplica-se porque vocês atendem consumidores no Brasil: base legal por tratamento, consentimento registrado (`consents` versionado), direitos do titular (acesso, correção, **exportação e exclusão** — telas self-service no painel + fila `data_requests` com prazo de 15 dias), DPO/encarregado nomeado, relatório de impacto se necessário.
- **EUA** — não há lei federal geral; na Flórida vale o **Florida Digital Bill of Rights (FDBR)**; se houver clientes na Califórnia, **CCPA/CPRA** (link "Do Not Sell/Share"). Boa prática: atender ao padrão mais alto (GDPR-like) para todos.
- **GDPR (UE)** — se aceitar clientes europeus, mesmos direitos + DPA com subprocessadores (Supabase, Stripe, carrier APIs — todos oferecem DPA padrão).
- **Práticas transversais:** minimização de dados, política de retenção (ex.: excluir fotos de pacotes após N meses, anonimizar contas encerradas), banner de cookies com consentimento real (analytics só após opt-in), Privacy Policy e Terms **escritos por advogado** (os atuais são placeholder), registro de tratamento de dados.

**Específico de package forwarding (importante e muitas vezes esquecido)**
- **Export compliance (EUA):** screening dos destinatários contra listas **OFAC/SDN e Denied Persons** (obrigatório para quem exporta dos EUA); bloqueio de países embargados; lista de itens proibidos (baterias soltas, aerossóis, ITAR/armas, perfumes conforme carrier) com verificação na inspeção do galpão (`prohibited_items_log`).
- **Declarações aduaneiras:** commercial invoice/CN22 corretos, valor declarado pelo cliente com aceite de responsabilidade nos Termos; AES filing quando valor > US$ 2.500 por item (o carrier/EasyPost geralmente cuida).
- **KYC:** verificação de identidade (Stripe Identity ou Sumsub) antes do primeiro envio, ou acima de certo valor — protege contra fraude de cartão + reshipping, o golpe nº 1 do setor.
- **Financeiro:** PCI-DSS delegado ao Stripe (SAQ-A); sales tax da Flórida sobre taxas de serviço a validar com contador; 1099-K etc. com contabilidade local.

## 2.8 App mobile (fase futura)

- **React Native + Expo** — reaproveita TypeScript, zod, i18n, `paymentService`/`authService` e o **mesmo Supabase** (mesma RLS, mesmas Edge Functions — zero backend novo).
- Diferenciais mobile: **push notification** ("Seu pacote chegou! 📦" com foto), scanner de código de barras para rastrear, biometria no login, deep link do e-mail para o envio.
- Publicação: App Store + Play Store com conta da empresa de Miami.
- Pré-requisito: Fases 2–4 abaixo prontas (o app é só mais um cliente da mesma API).

## 2.9 Roadmap sugerido

| Fase | Entrega | Conteúdo |
|---|---|---|
| **2** | Backend real | Supabase (Auth + schema + RLS + Storage), trocar `authService` mock pelo real, suites automáticas, e-mails transacionais, deploy dos secrets + push do CI pendente |
| **3** | Operação | Painel Admin/Ops (recebimento, fotos, consolidação), notificações Realtime, `rate_tables` + calculadora real, EasyPost/Shippo para etiquetas e tracking |
| **4** | Dinheiro | Stripe (cartão/Apple Pay/ACH) + dLocal/EBANX (Pix), webhooks, faturas, reembolsos no admin, Radar antifraude, armazenagem cobrada |
| **5** | Compliance & blindagem | KYC + screening OFAC, declaração aduaneira guiada, telas LGPD self-service, políticas jurídicas reais, headers de segurança, auditoria de RLS, pentest básico |
| **6** | Escala | App mobile (Expo), referral, dashboards de BI, personal shopper completo, suporte com SLA |

**Custo base estimado (mensal, início):** Supabase Pro ~US$ 25 + Resend ~US$ 20 + EasyPost (por etiqueta) + Stripe (2,9% + 30¢ por transação; ACH 0,8%) + dLocal/EBANX (negociado). Hostinger atual serve para o site; avaliar Cloudflare (grátis) na frente para CDN/WAF.

---

## Decisões em aberto (para você decidir antes da Fase 2)

1. **Provedor Pix/BRL:** dLocal, EBANX ou PagBrasil? (afeta contrato e taxas)
2. **KYC:** desde o primeiro cadastro ou só a partir do primeiro envio/valor X?
3. **Dias grátis de armazenagem** e preço da diária depois (regra de negócio central)
4. **Admin no mesmo domínio** (`/admin`) ou subdomínio separado (`admin.uboxredirect.com`)? — subdomínio separado é um pouco mais seguro e limpo
5. **Advogado** para Termos/Privacidade/compliance de exportação — recomendo escritório em Miami com experiência em logística

---

## Checklist manual consolidado (Fases 2–6)

Tudo abaixo é o que **só você** pode fazer — ou porque exige uma credencial/conta real que não existe neste ambiente, ou porque é uma ação irreversível/de custo real que não deve ser automatizada sem sua aprovação explícita. Todo o resto (schema, RLS, código de UI, Edge Functions) já está pronto e revisado; isto é só o que falta *ligar*.

### Deploy e CI (Fase 1/2)
- [ ] Fazer `git push` da branch para o GitHub (repositório remoto) se ainda não fez.
- [ ] Cadastrar os secrets do GitHub Actions em Settings → Secrets and variables → Actions: `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` (deploy do site na Hostinger) e `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (build do frontend com o Supabase real).

### Supabase (Fase 2/3/4/5)
- [x] Projeto Supabase criado (`iyxgrvqvthuvvxautrgm`) e todas as migrations de Fase 2–5 aplicadas em produção.
- [ ] Confirmar que o CLI do Supabase está de fato "linkado" a este projeto localmente (`supabase link`) se algum dia quiser rodar `supabase db push`/`supabase functions deploy` — hoje as migrations foram aplicadas manualmente pelo SQL Editor.

### Pagamentos — Stripe (Fase 4)
- [ ] Criar/confirmar a conta Stripe da empresa (Miami/Doral, FL).
- [ ] Implantar as Edge Functions: `supabase functions deploy create-checkout-session` e `supabase functions deploy stripe-webhook`.
- [ ] Configurar os secrets das functions: `supabase secrets set STRIPE_SECRET_KEY=sk_...` e `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...`.
- [ ] Registrar o endpoint do webhook no Stripe Dashboard (URL da function `stripe-webhook`), assinado ao menos em `checkout.session.completed`.
- [ ] Testar o fluxo ponta a ponta com o Stripe CLI (`stripe listen` + `stripe trigger checkout.session.completed`) antes de liberar para clientes reais — o comentário no topo de `supabase/functions/stripe-webhook/index.ts` documenta uma incerteza pontual sobre a API do SDK em runtime Deno que precisa ser confirmada nesse teste.

### Cotações de câmbio para exibição (Fase 7.2)
- [ ] Implantar a Edge Function: `supabase functions deploy refresh-exchange-rates` (sem secret novo — usa a service_role key padrão do ambiente da function).
- [ ] Agendar 1×/dia no Dashboard do Supabase (Integrations → Cron), invocando a função com o header de service_role padrão do agendador. Sem isso, o site simplesmente não mostra a estimativa "≈ R$" — nada quebra.
- Nota: a fonte (frankfurter.app/BCE) não publica ARS — clientes da Argentina não veem estimativa local por enquanto (documentado no código da função).

### Pagamentos — Pix/BRL (Fase 4, não construído)
- [ ] Escolher fornecedor (dLocal, EBANX ou PagBrasil — decisão em aberto acima) e negociar contrato/taxas.
- [ ] Depois de escolhido, a integração em si é um novo bloco de trabalho (services + Edge Function própria, seguindo o mesmo padrão do Stripe).

### Compliance (Fase 5)
- [ ] KYC automático (ex.: Stripe Identity) e triagem OFAC/SDN automática **não foram construídos** — hoje `kyc_status`/`ofac_screening_status` em `profiles` são só campos que um staff marca manualmente pelo painel admin. Decidir se/quando vale contratar um fornecedor real.
- [ ] Revisar com um advogado (Termos de Uso, Política de Privacidade, compliance de exportação dos EUA) — item já listado nas "Decisões em aberto" acima.

### Antes de ir ao ar de verdade
- [ ] Fazer merge das branches `feat/fase2-supabase-backend` → `feat/fase3-packages-admin` → `master` (ou abrir PRs) quando todas as fases estiverem revisadas — nenhuma foi mesclada ainda.
- [ ] Decidir domínio do admin (mesmo domínio `/admin` vs. subdomínio `admin.uboxredirect.com`).
- [ ] Definir dias grátis de armazenagem e preço da diária (regra de negócio usada em `rate_tables`/cobrança futura de armazenagem).

### App mobile (Fase 6)
- [ ] Criar/confirmar conta Apple Developer (US$99/ano) para publicação na App Store.
- [ ] Criar/confirmar conta Google Play Console (US$25 único) para publicação na Play Store.
- [ ] Instalar `eas-cli` (`npm install -g eas-cli`), rodar `eas login` e `eas build:configure` (requer conta EAS/Expo) antes de gerar os primeiros builds de produção com `eas build`/`eas submit`.
- [ ] Substituir o ícone e a splash screen do app (hoje são os placeholders padrão do template Expo em `mobile/assets/`) pelos definitivos da marca Bufano Redirect.
- [ ] Decidir a prioridade de i18n (pt/es) no app — v1 é inglês apenas; ver "Decisões em aberto" no plano de Fase 6.
- [ ] Testar o fluxo de pagamento do app ponta a ponta assim que as Edge Functions Stripe (`create-checkout-session`, `stripe-webhook`) forem implantadas com credenciais reais — mesma dependência já listada acima para o site; hoje só o caminho de erro do app foi validado (function ainda não implantada).
