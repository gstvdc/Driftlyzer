# Drift Guardian

Drift Guardian e um analisador de consistencia continua para repositorios. O foco inicial e detectar drift entre backend NestJS, frontend Angular, README, comentarios e contratos de API.

Leia primeiro [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md). Esse arquivo e a referencia persistente do projeto e concentra arquitetura, escopo, prioridades e o roadmap.

## Estado Atual

O repositorio foi inicializado com:

- estrutura base de monorepo TypeScript
- CLI local para `scan`
- pacote `core` com leitura e classificacao de arquivos
- pacote `shared` com tipos iniciais do dominio
- pacote `parsers` com extracao inicial de controllers/endpoints NestJS e chamadas HTTP Angular
- parser de README para endpoints, comandos e envs
- parser de `package.json` para scripts e parser de env para definicoes/usos
- `scan` ja retornando artefatos, relacoes e findings iniciais

## Primeiros Comandos

```bash
npm install
npm run scan -- .
npm run scan -- . --json
```

## Estrutura

```text
apps/
packages/
infra/
docs/
PROJECT_CONTEXT.md
```

## Proximo Marco

Implementar os primeiros extratores estruturais:

- enriquecimento de `frontend <-> backend` com payload/response
- primeira camada explicita de relacoes/grafo no dominio
- suite de testes versionada para fixtures
