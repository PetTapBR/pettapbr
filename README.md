# PETTAPBR

Sistema web moderno para identificacao inteligente de pets via NFC.

## Stack

- Next.js (App Router)
- React 19
- TailwindCSS 4
- Supabase (Database + Storage)
- Deploy: Vercel

## Funcionalidades

- Login/cadastro de tutor
- Dashboard com multiplos pets
- Gestao de tags NFC por tutor
- Perfil publico premium do pet
- Modo Perdido com alerta vermelho
- Registro de acessos NFC
- Notificacoes no painel
- Upload real de foto e video para Supabase Storage
- Persistencia do perfil no banco Supabase
- Escolha de localizacao por mapa ou localizacao atual
- Logo PETTAPBR integrada no app
- Fluxo real de ativacao de tag em `/t/[tagCode]`
- Assinatura Pro integrada ao Asaas com webhook (producao e sandbox por ambiente)

## Configuracao do Supabase

1. Crie um projeto Supabase.
2. Execute o SQL de [supabase/schema.sql](supabase/schema.sql).
3. Crie `.env.local` a partir de `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
PETTAPBR_ADMIN_EMAIL=admin@pettapbr.com
PETTAPBR_ADMIN_PASSWORD=troque-essa-senha
PETTAPBR_ADMIN_SECRET=troque-esse-segredo
ASAAS_API_KEY=...
ASAAS_BASE_URL=https://api.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=seu-token-forte-do-webhook
PRIVACY_CONTACT_EMAIL=privacidade@pettapbr.com
```

Sem essas variaveis, o sistema bloqueia cadastro/salvamento de pets e uploads.

## Patch LGPD

Execute tambem o patch LGPD:

1. Abra o SQL Editor do Supabase.
2. Abra o arquivo [supabase/lgpd_patch.sql](supabase/lgpd_patch.sql).
3. Copie e execute o conteudo.

## Assinatura Pro (Asaas Real)

1. No painel do Asaas, gere sua `ASAAS_API_KEY`.
2. Em `ASAAS_BASE_URL`, use:
   - Producao: `https://api.asaas.com/v3`
   - Sandbox: `https://api-sandbox.asaas.com/v3`
3. Crie um webhook para `https://SEU-DOMINIO/api/webhooks/asaas`.
4. Configure no webhook um token forte (o mesmo valor em `ASAAS_WEBHOOK_TOKEN`).
5. Selecione eventos:
   - `PAYMENT_RECEIVED`
   - `PAYMENT_CONFIRMED`
   - `SUBSCRIPTION_INACTIVATED`
   - `SUBSCRIPTION_DELETED`
6. No app, acesse `/plans`, informe CPF/CNPJ, gere a cobranca e conclua o pagamento.
7. A renovacao do plano sera aplicada automaticamente pelo webhook quando o pagamento for confirmado.
8. Ciclos e valores atuais do Plano Pro:
   - Mensal: R$ 9,90
   - Trimestral: R$ 27,90
   - Semestral: R$ 52,90
   - Anual: R$ 99,00

## Fluxo NFC

1. Grave a URL da tag NFC como `https://seu-dominio.com/t/CODIGO_DA_TAG`.
2. No primeiro acesso, se a tag estiver sem vinculo, o sistema abre a ativacao.
3. O tutor faz login, informa o codigo de ativacao da tag e escolhe o pet.
4. A partir dai, qualquer toque NFC abre o perfil publico do pet vinculado.

## Interface Admin de Tags NFC

- URL: `/admin/login`
- Funcoes:
  - Criar novas tags NFC (codigo + chave de ativacao)
  - Gerar link para gravar no chip NFC (`/t/CODIGO_DA_TAG`)
  - Copiar link pronto para gravacao
  - Desativar ou desvincular tags
  - Visualizar tutor/pet vinculados

## Rodar localmente

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`.

## Build de producao

```bash
npm run build
npm start
```

## Dados iniciais

O projeto inicia sem perfis de teste. Crie sua conta e cadastre seus pets pelo fluxo real de producao.

## Operacao em Producao

- Checklist de Go Live: [docs/go-live-checklist.md](docs/go-live-checklist.md)
- Guia LGPD operacional: [docs/lgpd-operacao.md](docs/lgpd-operacao.md)
