# Publicador de Instagram (substitui o agendamento do Metricool)

Publica sozinho, na hora marcada, as artes que estão na fila de cada cliente, usando a API oficial do Instagram. Roda de graça no GitHub Actions a cada 15 min, então o PC pode ficar desligado.

```
artes renderizadas (plano.json + <id>.jpg)
   └─ node scripts/enfileirar.mjs <cliente> plano.json   → copia pra midia/, escreve fila/<cliente>.json, git push
GitHub Actions (a cada 15 min)
   └─ scripts/publicar.mjs   → posta o que já chegou na hora → grava estado/<cliente>.json
GitHub Actions (toda segunda)
   └─ scripts/renovar-token.mjs   → renova o token de 60 dias de cada cliente
```

- **Imagens**: ficam no próprio repositório, que precisa ser **público** (a Meta baixa a imagem por um link aberto). São artes que vão ser postadas mesmo; tokens ficam nos secrets, nunca no repositório.
- **Horário**: o GitHub atrasa de 5 a 20 min. Se atrasar mais de `janelaMinutos` (180), o post é marcado `perdido` em vez de sair fora de hora.
- **Falhas**: cada post tem até 3 tentativas. Quando uma execução falha, o GitHub manda e-mail para o dono do repositório.
- **Segurança**: antes de postar, o script confere se o token é da conta `instagram` do `clientes.json`. Token de um cliente nunca posta no perfil de outro.

## Configuração (uma vez)

### 1. GitHub
1. No terminal: `gh auth login` (GitHub.com → HTTPS → login pelo navegador).
2. Depois peça ao Claude para criar o repositório público `publicador` e enviar esta pasta.

### 2. App da Meta (uma vez para a agência toda)
1. Em <https://developers.facebook.com/apps> → **Criar app** → caso de uso **"Gerenciar mensagens e conteúdo no Instagram"** → tipo **Empresa**.
2. No painel do app: **Instagram → Configuração da API com login do Instagram**.
3. As permissões necessárias são `instagram_business_basic` e `instagram_business_content_publish`. Com o app em **modo de desenvolvimento** elas já funcionam para as contas adicionadas ao app; não precisa de Análise do App.

### 3. Conta do cliente (uma vez por cliente)
1. O Instagram do cliente precisa ser **conta profissional** (Empresa ou Criador de conteúdo).
2. No painel do app, em **Gerar tokens de acesso → Adicionar conta**, entre com o Instagram do cliente e autorize.
   Se pedir convite de testador: em **Funções do app → Testadores do Instagram** adicione o @ e aceite no Instagram do cliente (Configurações → Permissões de sites → Apps e sites → Convites de testador).
3. Clique em **Gerar token** e copie (vale 60 dias; a renovação semanal estende sozinha).
4. Guarde o token: `node scripts/guardar-token.mjs elohim` e cole quando pedir (não aparece na tela). O script confere se o token é da conta certa e grava no `.env` (fora do Git) e no secret do GitHub.
5. Confira: `node scripts/verificar.mjs` deve mostrar `✓ elohim: @autocenterelohimsuspensao`.

### 4. Renovação automática do token
O Actions precisa de um token do GitHub que possa gravar secrets:
1. <https://github.com/settings/personal-access-tokens/new> → **Fine-grained** → acesso só ao repositório `publicador` → permissão **Secrets: Read and write** → validade de 1 ano.
2. `gh secret set GH_PAT` e cole.

Sem isso, renove no PC antes de vencer: `node scripts/renovar-token.mjs` (usa o `.env` e o `gh` logado).

## Uso

```
node scripts/enfileirar.mjs elohim ../auto-center-elohim-revisao/posts/2026-11-09/plano.json
node scripts/verificar.mjs
node scripts/publicar.mjs --simular --agora 2026-11-09T15:10:00-03:00
```

- Rodar de novo o `enfileirar` com o mesmo plano substitui as artes que ainda não saíram (para corrigir uma arte, renderize de novo e reenfileire).
- Para publicar já, sem esperar: GitHub → Actions → **Publicar no Instagram** → Run workflow.
- O que já saiu fica em `estado/<cliente>.json`, com o link do post.

### Formato da fila (`fila/<cliente>.json`)
```json
{ "posts": [
  { "id": "2026-11-09-15h", "data": "2026-11-09T15:00:00-03:00", "tipo": "POST",
    "midia": "midia/elohim/2026-11-09/2026-11-09-15h.jpg", "legenda": "..." },
  { "id": "2026-11-09-19h", "data": "2026-11-09T19:00:00-03:00", "tipo": "STORY",
    "midia": "midia/elohim/2026-11-09/2026-11-09-19h.jpg" }
] }
```
`tipo`: `POST` (feed, com legenda) ou `STORY` (sem legenda). Imagem só em JPEG; feed em 4:5 (1080×1350), story em 9:16 (1080×1920).

### Novo cliente
1. Acrescente em `clientes.json`: `"cliente": { "nome", "instagram": "@ sem arroba", "segredoToken": "IG_TOKEN_CLIENTE", "fuso": "America/Sao_Paulo", "janelaMinutos": 180 }`.
2. Faça o passo 3 da configuração com o novo `segredoToken`.
3. Nos dois workflows (`.github/workflows/*.yml`), acrescente no `env:` a linha `IG_TOKEN_CLIENTE: ${{ secrets.IG_TOKEN_CLIENTE }}`. (Passar todos os secrets de uma vez com `toJSON(secrets)` faz o GitHub bloquear o workflow como suspeito.)

## Limites da API
- 100 posts por conta a cada 24 h.
- Sem Reels, carrossel nem música por enquanto; o script só faz foto no feed e story de imagem. Reels e carrossel a API aceita, dá para acrescentar depois.
- Sem métricas: o Metricool continua útil para relatórios, se quiser.
