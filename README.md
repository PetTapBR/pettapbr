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

## Configuracao do Supabase

1. Crie um projeto Supabase.
2. Execute o SQL de [supabase/schema.sql](supabase/schema.sql).
3. Crie `.env.local` a partir de `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
PETTAPBR_ADMIN_EMAIL=admin@pettapbr.com
PETTAPBR_ADMIN_PASSWORD=troque-essa-senha
PETTAPBR_ADMIN_SECRET=troque-esse-segredo
```

Sem essas variaveis, o sistema bloqueia cadastro/salvamento de pets e uploads.

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
