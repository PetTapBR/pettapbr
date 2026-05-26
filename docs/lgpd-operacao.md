# PETTAPBR - Guia LGPD Operacional

Este guia organiza o minimo necessario para operacao com foco em LGPD.

## 1. Base legal e transparencia

1. Manter publicas as paginas:
   - `/privacy` (Politica de Privacidade)
   - `/terms` (Termos de Uso)
2. Exigir aceite no cadastro antes de criar conta.
3. Registrar data/hora e versao do aceite no banco.

## 2. Dados tratados no produto

1. Dados de tutor:
   - nome
   - e-mail
   - telefone/whatsapp (quando informado)
2. Dados do pet:
   - perfil, dados medicos e localizacao informados pelo tutor
3. Dados tecnicos:
   - historico de acessos
   - logs operacionais e de seguranca

## 3. Direitos do titular

1. Canal dedicado para solicitacoes:
   - e-mail de privacidade (ex.: `privacidade@seudominio.com`)
2. Procedimentos para atender:
   - confirmacao de tratamento
   - acesso aos dados
   - correcao
   - eliminacao/anonimizacao nos casos legais
   - portabilidade quando aplicavel

## 4. Retencao e descarte

1. Definir politicas de retencao por categoria de dado.
2. Excluir/anonimizar dados quando nao houver mais finalidade legal.
3. Registrar operacoes de eliminacao para auditoria.

## 5. Seguranca minima

1. RLS ativo em todas as tabelas de dados pessoais.
2. Segredos fora do frontend (somente server env).
3. Rate limit ativo em cadastro/login/recuperacao.
4. Backup e restauracao testados.
5. Monitoramento de erros e anomalias.

## 6. Itens tecnicos ja aplicados no projeto

1. Aceite obrigatorio de Termos e Politica no cadastro.
2. Registro do aceite em:
   - `owners.lgpd_consent_at`
   - `owners.lgpd_consent_version`
   - `owners.lgpd_consent_ip`
3. Paginas legais publicas no frontend.

## 7. Pendencias recomendadas para proxima sprint

1. Endpoint autenticado para exportar dados da conta (portabilidade).
2. Fluxo self-service de exclusao de conta com janela de confirmacao.
3. Tabela de trilha de auditoria para eventos sensiveis (admin e billing).

