# Bufano Redirect — Fluxo de Uso (detalhamento para gerar imagem/diagrama via IA)

> **Objetivo deste documento:** descrever o fluxo de uso do sistema (cliente + equipe do galpão) com detalhe suficiente para servir de insumo a uma IA de geração de imagem (Midjourney, DALL·E, Stable Diffusion, etc.) — seja para um infográfico de jornada do cliente, um fluxograma técnico, ou uma peça de marketing. A última seção traz um prompt pronto para colar nessas ferramentas.

---

## 1. Atores do sistema

| Ator | Quem é | Onde atua |
|---|---|---|
| **Cliente** | Pessoa física (majoritariamente no Brasil) que compra em lojas americanas e precisa de um endereço nos EUA para redirecionar as encomendas | Site (`/app`) e app mobile |
| **Equipe do galpão (Ops/Support)** | Funcionários que recebem, fotografam e conferem fisicamente os pacotes em Doral, FL | Painel Admin (`/admin`), só web |
| **Admin/Compliance** | Gestão, decide KYC/OFAC, resolve pedidos de LGPD, define tarifas | Painel Admin (`/admin`), só web |
| **Stripe** | Processador de pagamento (Checkout hospedado) | Backend (Edge Function) |
| **Supabase** | Banco de dados + autenticação + regras de acesso (RLS) — a única fonte de verdade | Backend, compartilhado entre site, admin e app mobile |

---

## 2. Jornada do cliente — visão macro (8 etapas)

```
① Cadastro  →  ② Endereço US (suite)  →  ③ Pré-alerta de compra  →  ④ Compra chega ao galpão
                                                                              ↓
⑧ Entrega no Brasil  ←  ⑦ Pagamento (Stripe)  ←  ⑥ Escolha de frete/transportadora  ←  ⑤ Inbox → seleciona e consolida
```

Cada etapa tem um ícone sugerido (para o infográfico) e os dados reais que o sistema manipula nela:

### ① Cadastro
- **Tela:** Signup (site `/signup` e app mobile)
- **Ícone sugerido:** pessoa + check ✅ ou formulário de cadastro
- **Dados:** nome, e-mail, país, senha; aceite de termos (LGPD/GDPR) registrado com versão e data
- **O que acontece por trás:** cria usuário no Supabase Auth → trigger cria automaticamente perfil, papel (`customer`) e **suite pessoal única**

### ② Endereço americano + suite
- **Tela:** "Meu Endereço US" (site) / aba Overview (app)
- **Ícone sugerido:** casa/prédio com bandeira dos EUA + etiqueta de endereço
- **Dados concretos:**
  - Endereço fixo do galpão: `8390 NW 25th St, Doral, FL 33122, USA`
  - Suite pessoal única por cliente, formato `BUF-XXXXX` (ex.: `BUF-10482`) — é o identificador que liga cada pacote físico ao dono
  - Botão de copiar endereço completo

### ③ Pré-alerta de compra ("vou receber uma encomenda")
- **Tela:** Notify Purchase / pré-alerta
- **Ícone sugerido:** sino de notificação + sacola de compras
- **Dados:** loja, código de rastreio, descrição do item, valor declarado (USD)
- **Status possíveis:** `pendente` → `combinado com pacote real` (automático quando o galpão recebe) → ou `cancelado` pelo cliente

### ④ Compra chega ao galpão (recebimento)
- **Tela:** só equipe (Admin → fila de pacotes)
- **Ícone sugerido:** caixa sendo escaneada/pesada em uma esteira ou balcão de recebimento
- **Dados:** peso real (kg), fotos do pacote, conferência de itens proibidos (baterias soltas, itens de exportação controlada)
- **Status do pacote (6 estados, com cor):**
  - `recebido` (cinza) → `em análise` (cinza) → `pronto para envio` (verde) → `consolidando` (âmbar) → `enviado` (azul) → ou `descartado` (vermelho)

### ⑤ Inbox — cliente vê e seleciona pacotes
- **Tela:** Inbox (site e app)
- **Ícone sugerido:** caixa de entrada com vários pacotes, alguns com checkbox marcado
- **Dados:** lista de pacotes com status, só pacotes `pronto para envio` podem ser selecionados
- **Ação:** cliente marca 1+ pacotes → botão "Consolidar"

### ⑥ Consolidação e escolha de frete
- **Tela:** Ship / calculadora de frete
- **Ícone sugerido:** caixas se juntando em uma única caixa maior + balança + mapa-múndi
- **Dados:** peso total, peso cubado (fórmula: `(comprimento × largura × altura) / 5000`), país de destino, opções de transportadora (Economy / Express) com preço e prazo, endereço de entrega final, descrição aduaneira + valor declarado

### ⑦ Pagamento
- **Tela:** Shipments (site e app) → botão "Pagar agora" → checkout Stripe hospedado
- **Ícone sugerido:** cartão de crédito + cadeado de segurança + logo de pagamento genérico
- **Status da consolidação (5 estados, com cor):**
  - `pendente` (âmbar) → `pago` (azul-marca) → `enviado` (azul) → `entregue` (verde) — ou `cancelado` (vermelho)

### ⑧ Envio e entrega
- **Tela:** Shipments — código de rastreio da transportadora internacional
- **Ícone sugerido:** avião/navio de carga cruzando um mapa saindo dos EUA em direção ao Brasil, terminando numa casa
- **Dados:** transportadora, código de rastreio, datas (pago em / enviado em)

---

## 3. Jornada paralela — Privacidade (LGPD/GDPR)

- **Tela:** Privacy (site e app), a qualquer momento
- **Ícone sugerido:** escudo com um cadeado ou um documento com selo de proteção
- **Ação do cliente:** solicitar exportação dos dados OU solicitar exclusão da conta, com nota opcional
- **Ação da equipe:** fila de pedidos abertos → resolve com nota de staff → status `pendente` → `em processamento` → `concluído`/`rejeitado`

---

## 4. Jornada paralela — Equipe do galpão / Admin (só web)

```
Fila de pacotes  →  Recebe/pesa/fotografa  →  Marca "pronto"  →  Fila de consolidações  →  Marca "enviado"
        ↓                                                                  ↓
Painel de KYC/OFAC (marca status do cliente)                  Fila de pedidos LGPD (resolve pedidos)
```

- **Ícone sugerido para o painel admin:** um dashboard/computador com gráficos, separado visualmente da jornada do cliente (paleta mais "corporativa")

---

## 5. Onde tudo acontece (arquitetura simplificada, para um diagrama técnico)

```
┌─────────────┐     ┌──────────────┐
│  Site web   │────▶│              │
├─────────────┤     │   Supabase   │────▶  Stripe (pagamento)
│ App mobile  │────▶│ (banco+auth) │
├─────────────┤     │              │
│ Painel Admin│────▶│              │
└─────────────┘     └──────────────┘
```

Um único banco de dados (Supabase), com regras de segurança por linha (RLS) garantindo que cada cliente só vê os próprios dados, e que só a equipe autorizada vê/edita dados de terceiros.

---

## 6. Paleta e identidade visual (para consistência com o produto real)

| Nome | Hex | Uso |
|---|---|---|
| Navy | `#0B1F3A` | texto principal, títulos |
| Brand/Blue | `#1E88E5` | ações primárias, destaque de marca |
| Off-white | `#F5F7FA` | fundo |
| Slate | `#0F172A` | texto secundário |
| Success/Green | `#16A34A` | status positivo (pronto, entregue, pago) |
| Âmbar | tons de `amber-500` | status intermediário (consolidando, pendente) |
| Vermelho | tons de `red-600` | status negativo (descartado, cancelado) |

---

## 7. Prompt pronto para IA de geração de imagem

Cole o texto abaixo (em inglês, para melhor compatibilidade com a maioria das ferramentas) numa IA de imagem como Midjourney, DALL·E ou Stable Diffusion:

> A clean, modern flat-design infographic illustrating a package-forwarding customer journey for a US-to-Brazil shipping service called "Bufano Redirect". Horizontal flow with 8 numbered stages, each with a simple flat icon inside a rounded card, connected by a curved arrow left to right: (1) Sign up — a person icon with a checkmark; (2) Get a US address & personal suite number — a warehouse building with a US flag and a mailbox label; (3) Notify an incoming purchase — a bell notification over a shopping bag; (4) Package arrives at the warehouse — a box being scanned and weighed on a conveyor belt; (5) Inbox — select packages — a inbox tray with checkboxes on small boxes; (6) Consolidate & choose shipping — multiple small boxes merging into one large box next to a world map and a scale; (7) Pay securely — a credit card with a lock icon; (8) Ship & deliver — a cargo plane flying over a map from the USA to Brazil ending at a house icon. Color palette: deep navy blue #0B1F3A, bright blue #1E88E5, off-white background #F5F7FA, green #16A34A for success states, amber for in-progress states. Minimalist vector illustration style, soft rounded shapes, plenty of white space, small numbered badges (1-8) above each card, subtle drop shadows, professional SaaS/logistics branding aesthetic, no text inside the icons themselves.

### Variante para fluxograma técnico (mais "diagrama", menos "marketing")

> A technical flowchart diagram, clean and minimal, showing three parallel swim lanes labeled "Customer", "Warehouse Staff", and "Backend (Supabase + Stripe)". Customer lane: Sign Up → Get US Address → Pre-alert Purchase → Select Packages → Choose Shipping → Pay → Track Delivery. Warehouse Staff lane (parallel, connected by dashed arrows to the customer lane at the matching stage): Receive Package → Weigh & Photograph → Mark Ready → Mark Shipped. Backend lane: Database with Row Level Security, Stripe Checkout, Webhook confirmation. Flat vector style, rounded rectangle nodes, arrows in bright blue #1E88E5, navy #0B1F3A text, off-white #F5F7FA background, subtle grid, corporate SaaS documentation style, no photorealism.

---

## 8. Diagrama Mermaid (alternativa gerável nesta própria sessão)

```mermaid
flowchart LR
    A["① Cadastro"] --> B["② Endereço US + Suite"]
    B --> C["③ Pré-alerta de compra"]
    C --> D["④ Pacote chega ao galpão"]
    D --> E["⑤ Inbox: seleciona pacotes"]
    E --> F["⑥ Consolida + escolhe frete"]
    F --> G["⑦ Pagamento (Stripe)"]
    G --> H["⑧ Envio e entrega"]

    style A fill:#1E88E5,color:#fff
    style B fill:#1E88E5,color:#fff
    style C fill:#1E88E5,color:#fff
    style D fill:#F59E0B,color:#fff
    style E fill:#F59E0B,color:#fff
    style F fill:#F59E0B,color:#fff
    style G fill:#16A34A,color:#fff
    style H fill:#16A34A,color:#fff
```
