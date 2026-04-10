# Driftlyzer

Driftlyzer e um analisador de consistencia continua para repositorios. O foco inicial e detectar drift entre backend NestJS, frontend Angular, README, comentarios e contratos de API.

Leia primeiro [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md). Esse arquivo e a referencia persistente do projeto e concentra arquitetura, escopo, prioridades e o roadmap.

## Estado Atual

O repositorio foi inicializado com:

- estrutura base de monorepo TypeScript
- CLI local para `scan`
- `apps/api` e `apps/worker` com bootstrap inicial orientado ao mesmo engine
- pacote `core` com leitura e classificacao de arquivos
- pacote `shared` com tipos iniciais do dominio
- pacote `parsers` com extracao inicial de controllers/endpoints NestJS e chamadas HTTP Angular
- parser de README para endpoints, comandos e envs
- parser de `package.json` para scripts e parser de env para definicoes/usos
- comparacao inicial de shape para request/response entre frontend e backend
- detectores deterministicos cobrindo:
  - frontend chamando rota inexistente no backend
  - endpoint backend sem consumidor Angular
  - mismatch de shape em request/response
  - endpoint/script/env desatualizado no README
  - comentario de endpoint com contrato desatualizado
- pipeline de findings com score deterministico e flag de publicacao
- revisao semantica opcional com IA local (Ollama + llama3) para explicar drift e sugerir correcao
- `scan` retornando artefatos, relacoes, grafo explicito e findings em JSON
- contrato estavel de finding v1 com `id`, `fingerprint`, `ruleVersion` e artefatos relacionados
- modo de precisao por diff com expansao de impacto
- MVP de GitHub com webhook, scan por diff e relatorio persistido em backend configuravel (filesystem ou PostgreSQL/Prisma)
- suite `Vitest` com fixtures versionados

## Primeiros Comandos

```bash
npm install
npm run scan -- .
npm run scan -- . --json
npm run scan -- . --publish-threshold 0.78
npm run scan -- . --semantic-review --ollama-model llama3
npm run scan -- . --changed-files frontend/src/app/users.service.ts,backend/src/users/users.controller.ts --impact-depth 2
npm run api:dev
npm run worker:run
npm run worker:listen
npm run dashboard:dev
npm run prisma:generate
npm test
```

## Persistencia (Filesystem ou PostgreSQL)

Camada de persistencia agora suporta 2 modos:

- `filesystem` (padrao quando `DATABASE_URL` nao estiver definida)
- `postgres` (automatico quando `DATABASE_URL` estiver definida, ou explicito via `DRIFTLYZER_PERSISTENCE=postgres`)

Configuracao basica em `.env` (use `.env.example` como base):

```bash
DRIFTLYZER_PERSISTENCE=postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/driftlyzer?schema=public
```

Inicializacao do Prisma:

```bash
npm run prisma:generate
npm run prisma:migrate:init
```

Se preferir nome customizado da migration:

```bash
npm run prisma:migrate:dev -- --name <nome_da_migration>
```

Importante: o comando de migrate so funciona com `DATABASE_URL` definida no ambiente.
Exemplo rapido:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/driftlyzer?schema=public npm run prisma:migrate:init
```

Alternativa sem migration local (ambiente de desenvolvimento):

```bash
npm run prisma:db:push
```

## Contrato de Finding v1

Campos estaveis adicionados no finding:

- `id`
- `schemaVersion` (`finding.v1`)
- `fingerprint`
- `ruleVersion`
- `relatedArtifactIds` e `relatedArtifacts`

Campos de compatibilidade no summary:

- `findingSchemaVersion`
- `compatibleFindingSchemaVersions`

Com isso, o consumidor externo (GitHub, dashboard, banco) consegue evoluir sem quebrar parsing.

## Precision Engine

Fluxo atual:

- analise completa estrutural
- score final por finding
- opcao de recorte por diff (`--changed-files`)
- expansao de impacto por relacoes (`--impact-depth`)
- filtro de findings para escopo impactado

Exemplo:

```bash
npm run scan -- . --changed-files frontend/src/app/users.service.ts,backend/src/users/users.controller.ts --impact-depth 2
```

## GitHub MVP Local

Entrada (API):

- endpoint `POST /webhooks/github`
- persiste job no backend configurado

Processamento (Worker):

- consome jobs pendentes
- executa `scan` por diff
- persiste findings no backend configurado
- monta comentario de PR pronto para publicacao

Fila (Redis + BullMQ):

- quando `DRIFTLYZER_QUEUE_MODE=bullmq` e `REDIS_URL` estao definidos, o webhook da API publica o job na fila
- o worker em `listen-queue` consome a fila e processa os jobs de forma continua
- sem Redis configurado, o sistema permanece em modo `polling` (fluxo atual via jobs pendentes)

Rodar local:

```bash
npm run api:dev
npm run worker:run
# ou para consumo continuo da fila BullMQ:
npm run worker:listen
```

Configuracao basica da fila:

```bash
DRIFTLYZER_QUEUE_MODE=bullmq
REDIS_URL=redis://127.0.0.1:6379
DRIFTLYZER_QUEUE_NAME=driftlyzer-scan-jobs
```

Opcional para webhook em monorepo/workspaces:

```bash
DRIFTLYZER_REPOSITORY_PATH=/caminho/absoluto/para/raiz/do/repositorio
```

Quando nao definido, a API tenta usar automaticamente `INIT_CWD` (diretorio onde `npm run` foi executado).

Publicacao de comentario em PR (PAT ou GitHub App):

```bash
# habilita publicacao no worker
DRIFTLYZER_PUBLISH_PR_COMMENT=true

# opcao A: token pessoal (PAT)
DRIFTLYZER_GITHUB_TOKEN=<token>

# opcao B: GitHub App
DRIFTLYZER_GITHUB_APP_ID=<app_id>
DRIFTLYZER_GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"

# opcional (GitHub Enterprise)
DRIFTLYZER_GITHUB_API_BASE_URL=https://api.github.com
```

Observacoes:

- para GitHub App, o webhook precisa trazer `installation.id` no payload
- a chave privada aceita formato multiline real ou string com `\n`

### Endpoints para dashboard

- `GET /findings/reports`: lista de relatorios persistidos para feed
- `GET /findings/reports/:jobId`: relatorio completo por job

## Dashboard Local

Interface de exploracao dos findings foi adicionada em `apps/dashboard`.

Rodar local (em terminais separados):

```bash
npm run api:dev
npm run dashboard:dev
```

O dashboard usa os relatorios persistidos no backend configurado e mostra:

- feed de relatorios
- filtros por severidade, tipo, texto e publishable
- painel de detalhe com `id`, `fingerprint`, `ruleVersion`, `schemaVersion` e score
- informacoes de escopo (`full` ou `diff`)

Idiomas do dashboard ficam centralizados em:

- `apps/dashboard/src/languages.ts` (`pt-BR`, `en`, `es`, `fr`)

## Modelo de Banco (base)

Foi definido o modelo relacional inicial em:

- `infra/database/schema.sql`

E a decisao tecnica correspondente em:

- `docs/decisions/0001-findings-persistence-model.md`

Esse schema prepara a transicao do armazenamento JSON para DB sem quebrar o contrato v1.

## Revisao Semantica com IA Local (Opcional)

Estrategia adotada:

- detector -> score -> (se necessario) IA -> output
- IA so para explicacao semantica e sugestao de correcao
- nucleo continua baseado em regras + AST

Preparacao local gratuita:

```bash
ollama pull llama3
ollama serve
```

Executar scan com revisao semantica:

```bash
npm run scan -- . --semantic-review --ollama-model llama3
```

Opcionalmente, configure URL customizada do Ollama:

```bash
npm run scan -- . --semantic-review --ollama-base-url http://127.0.0.1:11434
```

## Estrutura

```text
apps/
packages/
infra/
docs/
PROJECT_CONTEXT.md
```

## Prioridade Real do Projeto

Ordem validada para execucao:

1. PostgreSQL + Prisma
2. Redis + BullMQ
3. GitHub App (PR comments)
4. Diff-based analysis
5. Dashboard com historico
6. Expandir detectores
7. Score engine
8. LLM explicador

Status atual (9 de abril de 2026):

- concluidos: 1, 2, 3, 4, 5, 7, 8
- proximo foco: 6
