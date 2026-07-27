# Bufano Redirect — Site Institucional + Painel (Fase 1)

**Data:** 2026-07-27
**Status:** Aprovado (escopo) — aguardando revisão do spec

## 1. Visão Geral

Bufano Redirect é uma empresa de **redirecionamento de compras**: o cliente recebe um
endereço nos EUA, compra em lojas americanas, os pacotes chegam ao depósito da empresa,
são **consolidados** e **despachados** para o Brasil, para qualquer lugar dos EUA ou para
qualquer lugar do mundo.

Esta Fase 1 entrega a "página padrão" — o site institucional multilíngue — **mais** um
painel de usuário logado com dados fictícios, que antecipa a cara do futuro sistema. O
sistema real (rastreio ao vivo, pagamento, gestão de pacotes com backend) é uma fase
posterior.

### Objetivos
- Site institucional profissional que transmite **confiança** e explica o serviço.
- Multilíngue desde o dia 1: **Inglês, Português, Espanhol** (i18n estruturado para
  adicionar idiomas depois).
- Painel logado (mock) demonstrando o fluxo endereço → caixa → consolidação → envio.
- Base de código limpa, segura e acessível, pronta para plugar um backend real.

### Não-objetivos (Fase 1)
- Backend real, banco de dados, autenticação real, gateway de pagamento.
- Rastreio ao vivo de transportadoras / integração com APIs de frete reais.
- Cálculo de imposto/duties preciso por país (usaremos estimativa por tabela).

## 2. Direção Visual

**"Corporativo Confiável"** — sóbrio e sólido, foco em segurança.

| Token | Valor | Uso |
|-------|-------|-----|
| `navy` | `#0B1F3A` | Base, header, footer, títulos |
| `blue` | `#1E88E5` | Botões primários, links, destaques |
| `offwhite` | `#F5F7FA` | Fundos de seção |
| `slate` | `#0F172A` | Texto principal |
| `success` | `#16A34A` | Status ("entregue", "pronto") |
| `white` | `#FFFFFF` | Cards, base |

Tipografia sans-serif limpa; cantos levemente arredondados; bastante respiro; ícones de
linha. Mobile-first e responsivo.

## 3. Arquitetura Técnica

- **Build/Runtime:** Vite + React + TypeScript
- **Estilo:** Tailwind CSS + shadcn/ui (componentes acessíveis)
- **Rotas:** React Router
- **i18n:** react-i18next (namespaces por página; EN/PT/ES)
- **Formulários:** react-hook-form + zod (validação)
- **Dados:** mock em TS local (`src/mocks/`); sem backend
- **Sem segredos no código;** pronto para HTTPS.

### Organização de pastas (proposta)
```
src/
  components/      # UI reutilizável (Header, Footer, Button, Card, LanguageSwitcher…)
  components/ui/   # primitivos shadcn/ui
  pages/           # páginas públicas
  pages/auth/      # login, cadastro, recuperar senha
  pages/dashboard/ # painel logado (mock)
  layouts/         # PublicLayout, DashboardLayout
  i18n/            # config + locales/{en,pt,es}/*.json
  services/        # authService (mock, isolado p/ trocar por API real)
  mocks/           # dados fictícios (pacotes, envios, endereço)
  lib/             # helpers (cálculo de frete estimado, formatação)
  routes.tsx       # definição central de rotas
```

### Camada de isolamento (chave para evoluir)
- **`authService`** expõe `login`, `register`, `logout`, `getSession`. Implementação Fase 1
  usa `localStorage`; a assinatura não muda quando plugarmos a API real.
- **`shippingEstimator`** calcula frete por tabela peso×zona (com peso dimensional);
  substituível por API real depois sem mexer na UI.

## 4. Telas e Funcionalidades

### 4.1 Público / Institucional

1. **Home** — hero + CTA "Criar conta grátis"; "como funciona" em 5 passos resumidos;
   grade de benefícios; lojas populares (Amazon, eBay, Target…); exemplos de economia;
   depoimentos; CTA final; footer.
2. **Como Funciona** — fluxo detalhado: endereço nos EUA → você compra → chega no depósito
   → consolida/reempacota → despacha para o mundo.
3. **Preços & Planos** — plano Grátis vs Premium (armazenamento, benefícios) + tabela de
   taxas por serviço adicional.
4. **Serviços** — consolidação, reempacotamento, fotos dos itens, assistente de compras,
   proteção de valor, armazenamento estendido.
5. **Calculadora de Frete** — origem (EUA) → país destino + peso/dimensões →
   **estimativa** de custo. Usa `shippingEstimator` (tabela). Validação com zod.
6. **FAQ** — accordion por categorias.
7. **Sobre** — história e missão.
8. **Contato** — formulário validado (nome, e-mail, mensagem) + e-mail/horário/endereço.
9. **Termos de Uso** e 10. **Política de Privacidade** — páginas de apoio.

### 4.2 Autenticação
11. **Login** — e-mail + senha, validação, "esqueci a senha".
12. **Cadastro** — nome, e-mail, país, senha (força de senha), aceite de termos.
13. **Recuperar senha** — solicitação por e-mail (mock).
14. **Verificação de e-mail** — tela de apoio (mock).

Auth simulada via `localStorage` através de `authService`; rotas do painel protegidas por
guarda que exige sessão.

### 4.3 Painel do Usuário (dados fictícios)
15. **Visão Geral** — boas-vindas, card do endereço nos EUA, estatísticas rápidas
    (na caixa / a caminho / entregues).
16. **Meu Endereço nos EUA** — endereço + suite nº, botão copiar.
17. **Minha Caixa** — lista de pacotes recebidos (loja, peso, status, fotos); seleção para
    consolidar.
18. **Consolidar & Enviar** — seleciona pacotes → escolhe transportadora → declaração
    aduaneira → estimativa de custo → checkout (mock).
19. **Histórico de Envios** — envios passados com status.
20. **Assistente de Compras** — formulário de pedido (link do produto, quantidade, obs.).
21. **Minha Conta** — perfil, idioma, notificações, endereços de entrega.

### 4.4 Transversal (todas as telas)
- Seletor de idioma **EN / PT / ES** no header.
- Header + Footer padrão (PublicLayout / DashboardLayout).
- Responsivo mobile-first, acessível (a11y), SEO básico (títulos, meta, HTML semântico).

## 5. Segurança e Qualidade
- Validação de todas as entradas com **zod**; mensagens de erro claras.
- Renderização segura (padrão React, sem `dangerouslySetInnerHTML`).
- Acessibilidade: navegação por teclado, labels, contraste, `alt` em imagens.
- Sem segredos no código; `.env` ignorado no git.
- Separação clara mock ↔ produção (`authService`, `shippingEstimator`) para evolução sem
  retrabalho.

## 6. Fora de Escopo (fases futuras)
Backend + banco, auth real, pagamento, rastreio ao vivo, cálculo fiscal preciso, painel
administrativo interno.
