# Bufano Redirect — App Mobile (Expo)

App mobile (Expo/React Native + TypeScript) para clientes finais da Bufano Redirect, reaproveitando o **mesmo backend Supabase** (schema, RLS, Edge Functions) já usado pelo site em `src/`. Nenhuma mudança de banco foi necessária.

## O que o app cobre

Login e cadastro (Supabase Auth), endereço americano + número de suite do cliente, pré-alerta de compra (`Notify Purchase`), caixa de entrada de pacotes recebidos no galpão (`Inbox`) com seleção múltipla, consolidação de pacotes selecionados em um envio com cotação de frete em tempo real (`Ship`), acompanhamento e pagamento dos envios via Stripe Checkout hospedado (`Shipments`), e autoatendimento de privacidade/LGPD-GDPR para exportação ou exclusão de dados (`Privacy`).

## Como rodar

```bash
cd mobile
npm install
npx expo start --web      # abre no navegador (usado para validação visual neste ambiente, sem simulador/dispositivo)
npx expo start --ios      # requer macOS + Xcode ou Expo Go num iPhone
npx expo start --android  # requer Android Studio/emulador ou Expo Go num Android
```

## Variáveis de ambiente

Copie `mobile/.env.example` para `mobile/.env` e preencha com as credenciais reais do projeto Supabase (o mesmo projeto usado pelo site):

```
EXPO_PUBLIC_SUPABASE_URL=https://iyxgrvqvthuvvxautrgm.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Sem essas variáveis, `mobile/src/lib/supabase.ts` lança um erro explícito na inicialização.

## Testes e typecheck

```bash
cd mobile
npx jest          # testes da camada de serviços (mirror dos testes de src/services do site)
npx tsc --noEmit  # typecheck
```

## Fora do escopo do v1 (documentado, não esquecido)

- **Publicação nas lojas** (Apple App Store / Google Play) — exige contas de desenvolvedor pagas do usuário e configuração de `eas build`/`eas submit`. Ver checklist manual em `docs/SISTEMA-E-ROADMAP.md`.
- **Recuperação de senha no app** — o cliente usa o site para "esqueci minha senha" neste v1; o app apenas indica isso.
- **i18n (pt/es)** — v1 é inglês apenas, para não triplicar esforço de tradução sem poder testar em dispositivo real. Pendência documentada para v2.
- **Deep-link de retorno do Stripe Checkout** — o app abre o checkout num browser in-app (`expo-web-browser`) e, ao o app voltar ao primeiro plano, refaz a busca de consolidações para refletir o pagamento; não há navegação automática de volta para dentro do app via deep link.
- **Testes de componente/tela** (`@testing-library/react-native`) — os testes automatizados cobrem a camada de serviços; a verificação visual das telas é feita manualmente via `expo start --web`.

Checklist manual completo (contas necessárias, deploy, pendências) em [`docs/SISTEMA-E-ROADMAP.md`](../docs/SISTEMA-E-ROADMAP.md), seção "Checklist manual consolidado".
