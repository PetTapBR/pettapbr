# PETTAPBR - Go Live Checklist

Checklist pratico para iniciar operacao com clientes reais.

## Fase 1 (Hoje) - Obrigatorio

1. Confirmar variaveis no Vercel (Production e Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `PETTAPBR_ADMIN_EMAIL`
   - `PETTAPBR_ADMIN_PASSWORD`
   - `PETTAPBR_ADMIN_SECRET`
   - `ASAAS_API_KEY`
   - `ASAAS_BASE_URL`
   - `ASAAS_WEBHOOK_TOKEN`
   - `WEB_PUSH_VAPID_PUBLIC_KEY`
   - `WEB_PUSH_VAPID_PRIVATE_KEY`
   - `WEB_PUSH_VAPID_SUBJECT`
2. Rodar SQL base: `supabase/schema.sql`.
3. Rodar SQL LGPD: `supabase/lgpd_patch.sql`.
4. Validar URL de callback de recuperacao de senha no Supabase:
   - `https://SEU_DOMINIO/login`
   - `https://SEU_DOMINIO/login?mode=recovery`
5. Configurar SMTP custom (Brevo) no Supabase Auth.
6. Confirmar webhook Asaas:
   - URL: `https://SEU_DOMINIO/api/webhooks/asaas`
   - Token igual ao `ASAAS_WEBHOOK_TOKEN`
7. Teste completo de compra:
   - Criar cobranca
   - Pagar
   - Confirmar upgrade e validade do plano no app

## Fase 2 (72h) - Estabilizacao

1. Criar rotina de backup e restauracao do banco.
2. Ativar monitoramento de erros (Sentry ou equivalente).
3. Monitorar falhas de webhook (Asaas) e falhas de e-mail (Brevo).
4. Revisar logs de acesso admin e tentativas de login.
5. Definir playbook de suporte:
   - tag nao vinculada
   - nao recebi e-mail
   - pagamento aprovado e plano nao atualizou

## Fase 3 (7 dias) - Escala

1. Revisar limites de upload de foto/video.
2. Adicionar alertas automaticos para erro 5xx.
3. Criar dashboard operacional:
   - novos cadastros
   - tags ativadas
   - pagamentos confirmados
   - tickets de suporte
4. Auditar politicas RLS apos qualquer mudanca de schema.

## Testes Minimos Antes de Abrir

1. Cadastro com chave de ativacao.
2. Confirmacao de e-mail.
3. Login.
4. Cadastro de pet.
5. Vinculacao de tag NFC.
6. Leitura publica da tag.
7. Compartilhar localizacao via WhatsApp.
8. Modo perdido + notificacao no painel.
9. Recuperacao de senha ponta a ponta.
10. Upgrade de plano e renovacao.
