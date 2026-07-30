# Spec — Fase 7: Back-Office Profissional (operação de uma pessoa)

> **Status:** rascunho para validação do usuário antes do plano de execução.
> **Base:** `docs/FLUXO-BACK-OFFICE.md` (fluxo validado) + auditoria do que já existe (Fases 2–6).
> **Princípio de design:** uma única pessoa opera toda a empresa. Automação e painel de pendências são o coração; nenhuma ação rotineira pode exigir mais de 1–2 cliques.

---

## 1. Objetivo

Transformar o painel admin atual (filas básicas de pacotes/consolidações/LGPD) num back-office completo que permita a UMA pessoa: receber mercadoria com match de pré-alerta e etiqueta QR de localização, controlar o estoque físico do galpão, gerir pagamentos e tarifas, administrar clientes e staff, e deixar a comunicação com o cliente 100% automática.

## 2. Não-objetivos (fora desta fase)

- Integração REAL com Correios/agregador de rastreio (fica o "encaixe" pronto: tabela + endpoint + normalização; a credencial/contrato é decisão futura do usuário)
- Envio REAL de e-mails (fica a infraestrutura de outbox + templates; ligar o provedor — Resend — exige conta/API key do usuário; sem chave, os e-mails ficam registrados como "pendentes de envio" no outbox, visíveis no painel)
- Pix/BRL (continua pendência da Fase 4, fornecedor a contratar)
- KYC/OFAC automáticos (continuam manuais, como na Fase 5)
- App mobile para staff (back-office é só web)

## 3. O que já existe e será reaproveitado

| Já existe | Onde | O que muda |
|---|---|---|
| Fila de pacotes (receber, marcar pronto) | `PackagesQueue.tsx` | Ganha match de pré-alerta, dimensões, foto, localização + etiqueta QR |
| Fila de consolidações (marcar enviado) | `ConsolidationsQueue.tsx` | Ganha lista de coleta com localizações e conferência por QR |
| Fila LGPD | `DataRequestsQueue.tsx` | Passa a alimentar o painel de pendências |
| Overview admin (contadores) | `admin/Overview.tsx` | Evolui para o Painel de Pendências (item central da fase) |
| KYC/OFAC manual | `PackagesQueue.tsx` | Move para o perfil do cliente (nova tela) |
| `rate_tables` (RLS admin-write pronta) | banco | Ganha tela de gestão + simulador |
| `payments` (escrita só service_role) | banco | Ganha tela de consulta + registro manual + estorno |
| `user_roles` + `private.is_staff()` | banco | Ganha tela de gestão de papéis |
| Storage bucket `package-photos` | banco | Ganha UI de upload no recebimento |
| Trigger `match_expected_package` | banco | Passa a ser alimentado de verdade (UI envia `expected_package_id`) |

## 4. Modelo de dados — novas tabelas e alterações

### 4.1 Warehouse (novas)

```
warehouse_locations
  id uuid pk
  zone text not null default 'G'          -- R/G/V/Q (opcional na prática: default G)
  aisle text not null                     -- 'A', 'B', 'C'
  rack text not null                      -- '01'..'99'
  level text not null                     -- '1'..'9'
  bin text not null                       -- '01'..'99'
  code text generated (zone||'-'||aisle||'-'||rack||'-'||level||'-'||bin) unique
  active boolean not null default true
  created_at timestamptz
  unique (zone, aisle, rack, level, bin)
```

- `packages.location_id uuid null references warehouse_locations` (alteração na tabela existente)
- Ocupação é derivada: posição ocupada = existe pacote com `location_id` apontando para ela e status em (`received`,`in_review`,`ready`,`consolidating`). Sem tabela de ocupação separada — menos estado para dessincronizar.
- `package_location_history` (id, package_id, from_location_id, to_location_id, moved_by, moved_at) — trilha de movimentação.
- **RLS:** staff lê/escreve; cliente não vê nada de warehouse (localização é interna).
- **Cadastro em massa:** função `private.generate_locations(zone, aisles text[], racks int, levels int, bins int)` chamada por RPC admin-only — gera a grade toda de uma vez.
- **Sugestão de próxima posição livre:** função `private.next_free_location()` — menor `code` ativo e livre (determinística e simples; otimização de "perto da expedição" é ajuste futuro do ordenamento).

### 4.2 Etiqueta QR

- Sem tabela nova. O QR codifica a URL `https://<admin>/admin/packages/<package_id>` (escanear com o celular abre a ficha direto).
- Geração da etiqueta é client-side (lib `qrcode` no navegador → layout de impressão A6/térmica via CSS `@media print`): QR + suite grande + código de localização + data/peso. Zero dependência de servidor.

### 4.3 Financeiro (alterações + nova)

```
payments (alterações)
  method text not null default 'stripe'   -- 'stripe' | 'manual_pix' | 'manual_transfer' | 'manual_other'
  registered_by uuid null references profiles  -- staff que registrou pagamento manual
  notes text not null default ''

refunds (nova)
  id uuid pk
  payment_id uuid not null references payments
  amount_usd numeric(10,2) not null
  reason text not null
  status text not null default 'requested'  -- requested | processed | failed
  requested_by uuid not null references profiles
  created_at / processed_at
```

- **Pagamento manual:** staff marca consolidação `pending` como paga fora do Stripe → insere linha em `payments` com `method='manual_*'` + atualiza consolidação para `paid`. Precisa de RLS nova: policy de INSERT em `payments` para staff **somente** com `method != 'stripe'` (Stripe continua exclusivo do service_role — impossível staff forjar um pagamento "stripe").
- **Estorno:** linha em `refunds`; o processamento real no Stripe é manual no dashboard deles nesta fase (documentado na tela) — o sistema registra e concilia.
- **Conciliação (sem tabela):** views/queries no painel de pendências: consolidações `paid` sem envio há mais de N dias; consolidações `shipped` sem payment `succeeded`.

### 4.4 Tarifas e taxas de serviço

- `rate_tables` já existe (zona destino, carrier, base, por kg, multiplicador, prazo) — só ganha UI CRUD.
- `service_fees` (nova): id, key unique (`consolidation_per_package`, `repackaging`, `extra_photo`, `storage_per_day`, `value_protection_pct`), label, amount_usd, active. RLS: leitura pública (o site mostra preços), escrita admin. Substitui os valores hoje fixos no i18n do site.
- `settings` (nova, chave-valor): `free_storage_days`, `warehouse_address`, `company_name`, etc. RLS: leitura staff (os públicos expostos via view), escrita admin.

> **Dívida registrada para a 7.3 (da revisão da 7.2):** a policy `refunds_update_staff` permite qualquer staff editar qualquer coluna de um refund via API direta (a UI só permite a transição requested→processed|failed). Quando o `audit_log` imutável entrar (7.3), avaliar também um trigger de proteção de colunas em `refunds` (amount_usd/reason/payment_id imutáveis após criação) no mesmo padrão dos triggers de proteção existentes.

### 4.5 Staff, auditoria e clientes

```
audit_log (nova)
  id uuid pk
  actor_id uuid not null references profiles (on delete restrict)  -- padrão de retenção estabelecido
  action text not null            -- 'package.received', 'payment.manual', 'role.granted', ...
  entity text not null            -- 'package' | 'payment' | 'consolidation' | ...
  entity_id uuid null
  detail jsonb not null default '{}'
  created_at timestamptz
```

- **RLS:** INSERT staff (via funções de serviço — cada escrita relevante do adminService grava um evento); SELECT admin/super_admin; **sem UPDATE/DELETE para ninguém** (log imutável; nem admin edita auditoria).
- **Gestão de papéis:** RPC `private.set_user_role(user_id, role)` — só admin/super_admin executa; regras: ninguém altera o próprio papel; só super_admin concede/revoga admin. UI lista usuários com papel, busca, botão promover/rebaixar. Grava em `audit_log`.
- **Convite de staff:** nesta fase = criar o usuário pelo fluxo normal de signup + promover pela tela (documentado). Convite por e-mail automático depende do provedor de e-mail (fica na fase do outbox).
- **Notas internas do cliente:** `customer_notes` (id, user_id → restrict, author_id → restrict, note, created_at). RLS: staff INSERT/SELECT; cliente NUNCA vê (não há policy de select para dono — é nota interna).
- **Suspensão de cliente:** `profiles.suspended_at timestamptz null` + checagem no login do site/app (mensagem "conta suspensa, contate o suporte"). Escrita: trigger de proteção igual ao padrão KYC (staff ou service_role).

### 4.6 Comunicação (outbox) e rastreio (encaixe)

```
email_outbox (nova)
  id uuid pk
  user_id uuid not null references profiles (on delete restrict)
  template text not null          -- 'package_received' | 'package_ready' | 'payment_confirmed' | 'shipped' | 'storage_warning'
  payload jsonb not null          -- variáveis do template (loja, peso, tracking...)
  status text not null default 'pending'   -- pending | sent | failed | skipped
  created_at / sent_at / error text

tracking_events (nova)
  id uuid pk
  consolidation_id uuid not null references consolidations
  source text not null            -- 'webhook:aftership' | 'poll:correios' | 'manual'
  raw_status text not null
  normalized_status text not null -- 'in_transit' | 'customs' | 'out_for_delivery' | 'delivered' | 'exception'
  occurred_at timestamptz not null
  payload jsonb not null default '{}'
  created_at timestamptz
```

- **Outbox:** triggers/serviços inserem a linha no evento certo (pacote recebido, pronto, pago, enviado). Uma Edge Function `send-emails` (cron a cada X min) processa `pending` → chama Resend **se** `RESEND_API_KEY` existir; sem chave, marca `skipped` com aviso no painel. Cliente nunca fica sem registro do que deveria ter recebido.
- **Tracking:** Edge Function `tracking-webhook` (verify_jwt=false + validação de assinatura do fornecedor via secret) grava em `tracking_events`; trigger no INSERT: se `normalized_status='delivered'` e consolidação está `shipped` → marca `delivered` + outbox; se `exception` → entra no painel de pendências. RLS: cliente SELECT dos eventos das próprias consolidações (alimenta a linha do tempo no site/app); escrita só service_role.
- `consolidations.status` ganha o valor `delivered` já usado no site/mobile (verificar constraint atual — o site já tipa `delivered`; garantir que o CHECK do banco aceita).

## 5. Telas (todas sob `/admin`, atrás de `StaffRoute`)

| # | Tela | Rota | Conteúdo essencial |
|---|---|---|---|
| 1 | **Painel de Pendências** (substitui Overview) | `/admin` | Cartões-fila: a conferir, pagas sem envio, LGPD abertos, armazenagem vencendo, exceções de rastreio, e-mails falhados. Cada cartão → link direto para a ação |
| 2 | Recebimento (evolução) | `/admin/packages` | Suite/tracking → cliente + pré-alertas pendentes clicáveis → peso, C×L×A, foto → posição sugerida (editável) → salvar → **tela de impressão da etiqueta QR** |
| 3 | Ficha do pacote | `/admin/packages/:id` | Destino do QR: dados, fotos, histórico de localização, mover posição, status |
| 4 | Expedição (evolução) | `/admin/consolidations` | Só pagas; lista de coleta ordenada por localização; conferência por QR (input com scanner de câmera ou digitação); peso final; tracking; enviado |
| 5 | Warehouse | `/admin/warehouse` | Gerador de grade em massa; mapa de ocupação (grid colorido livre/ocupada); ativar/desativar posição |
| 6 | Pagamentos | `/admin/payments` | Lista com filtros; registrar pagamento manual; registrar estorno; alertas de conciliação |
| 7 | Tarifas & taxas | `/admin/rates` | CRUD `rate_tables`; CRUD `service_fees`; simulador (peso+destino → preço) |
| 8 | Clientes | `/admin/customers` | Busca nome/e-mail/suite; perfil completo (pacotes, envios, pagamentos, LGPD, KYC/OFAC — movido para cá, notas internas); suspender/reativar |
| 9 | Staff | `/admin/staff` | Lista de usuários com papel; promover/rebaixar; log de auditoria (leitura) |
| 10 | Configurações | `/admin/settings` | `settings` chave-valor editável; status do e-mail (chave configurada? outbox pendente?) |

Cliente (site + app) ganha só: **linha do tempo de rastreio** na tela de envios (lê `tracking_events`).

## 6. Segurança (regras herdadas das fases anteriores — aplicar desde o início)

1. Toda tabela nova nasce com RLS habilitada e policies explícitas; nada de "arrumar depois" (lição da Fase 5: policy de linha faltante = feature silenciosamente morta)
2. Staff e cliente compartilham o role `authenticated` → colunas staff-only protegidas por GRANT de coluna + trigger `BEFORE UPDATE` com `private.is_staff() or auth.role() = 'service_role'` (padrão já estabelecido 3×)
3. FKs de tabelas de auditoria/evidência (`audit_log.actor_id`, `customer_notes.*`, `email_outbox.user_id`) usam `on delete restrict` (padrão de retenção estabelecido)
4. `payments` via staff: INSERT só com `method != 'stripe'` (WITH CHECK) — impossível forjar pagamento Stripe
5. `audit_log` imutável: sem policy de UPDATE/DELETE para nenhum papel
6. Funções sensíveis no schema `private` (nunca expostas como RPC público) — lição da Fase 2
7. Webhook de rastreio: `verify_jwt = false` no gateway + validação de assinatura própria do fornecedor dentro da função (padrão do stripe-webhook)
8. Toda UPDATE staff→linha-de-terceiro confere que a policy de LINHA existe (lição da Fase 5) e as mutações críticas usam `.select()` para detectar 0-linhas-afetadas em vez de sucesso otimista

## 7. Ondas de execução propostas

| Onda | Conteúdo | Valor entregue |
|---|---|---|
| **7.1 — Operação física** | warehouse_locations + geração em massa + next_free_location + location_id/history em packages + recebimento com match/dimensões/foto + etiqueta QR + ficha do pacote + expedição com lista de coleta | O galpão funciona de verdade: match, etiqueta, achar pacote |
| **7.2 — Pendências & dinheiro** | Painel de Pendências + payments (método/manual/estorno) + conciliação + tarifas/taxas/simulador + settings | Uma tela diz o que fazer; dinheiro sob controle |
| **7.3 — Pessoas** | Clientes (busca/perfil/notas/suspensão, KYC-OFAC movido) + Staff (papéis) + audit_log | Gestão de contas sem SQL manual |
| **7.4 — Automação** | email_outbox + templates + Edge Function send-emails (cron) + tracking_events + tracking-webhook + linha do tempo no cliente + alertas de armazenagem | O "funcionário invisível" |

Cada onda: migration → aplicar em produção → services+UI via subagentes → revisão spec+segurança → correções → commit/merge. Mesmo processo das Fases 2–6.

## 8. Dependências externas (decisões do usuário, não bloqueiam o código)

| Decisão | Bloqueia o quê | Enquanto não decidir |
|---|---|---|
| Conta Resend (ou similar) + API key | Envio real de e-mail | Outbox registra tudo como `skipped`; painel mostra aviso |
| Agregador de rastreio (AfterShip/17TRACK/...) ou contrato Correios | Rastreio automático real | Endpoint pronto; staff pode inserir evento manual |
| Impressora térmica ou A4 para etiquetas | Nada — etiqueta imprime em qualquer impressora via navegador | — |
| Valores reais das taxas de serviço | Nada — CRUD pronto, valores editáveis | Migra os valores atuais do i18n como seed |

## 9. Questões em aberto — RESPONDIDAS pelo usuário em 30/07/2026

1. **Zonas do warehouse:** ✅ nascer com a estrutura COMPLETA de endereçamento (zona-corredor-estante-nível-posição), mas a grade inicial reflete o galpão real pequeno: **1 zona (`G`), 1 corredor (`A`), ~10 estantes**, níveis/posições conforme couber. Crescer é só gerar mais grade — o modelo já suporta.
2. **Tamanho da grade inicial:** ✅ galpão pequeno, ~10 estantes. Seed inicial sugerido: `G-A-01..10`, 4 níveis, 6 posições por nível = 240 posições (ajustável na tela de geração em massa).
3. **Etiqueta:** ✅ **térmica 4×6" (100×150mm), impressora Zebra (termotransferência)**. Implementação: layout CSS `@page { size: 4in 6in }` para impressão via navegador (funciona com o driver Zebra). Geração ZPL nativa fica como melhoria futura, não é necessária para imprimir.
4. **Moeda:** ✅ **tudo registrado e armazenado em USD** (empresa em Miami). PIX manual, se ocorrer, registrado em USD com nota livre do valor original. **Preparar multi-moeda apenas para EXIBIÇÃO:** ver seção 10.

## 10. Multi-moeda (preparação, decidida em 30/07/2026)

Princípio: **USD é a única moeda de verdade** — todos os preços, pagamentos e relatórios em dólar. Multi-moeda existe só para o cliente ter noção do valor na moeda do país dele.

```
currencies (nova)
  code text pk            -- 'USD', 'BRL', 'EUR', ...
  name text not null
  symbol text not null    -- '$', 'R$', '€'
  active boolean not null default true

exchange_rates (nova)
  id uuid pk
  currency_code text not null references currencies
  rate_per_usd numeric(14,6) not null   -- quantas unidades da moeda = 1 USD
  quoted_at date not null
  unique (currency_code, quoted_at)
```

- **Cotação diária automática:** Edge Function `refresh-exchange-rates` (cron 1×/dia) consultando uma API gratuita sem chave (ex.: frankfurter.app, dados do BCE) — sem credencial nova para o usuário gerenciar. Falha de cotação = mantém a última e alerta no painel (nunca bloqueia nada).
- **Exibição:** site/app mostram "≈ R$ 987,00" ao lado do valor USD, marcado como estimativa do dia; a cobrança é sempre em USD.
- **RLS:** leitura pública (o site precisa mostrar); escrita só service_role (a função de cron).
- Entra na **Onda 7.2** (junto do bloco financeiro).
