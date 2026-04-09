# Drift Guardian

Drift Guardian e um analisador de consistencia continua para repositorios. O foco inicial e detectar drift entre backend NestJS, frontend Angular, README, comentarios e contratos de API.

Leia primeiro [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md). Esse arquivo e a referencia persistente do projeto e concentra arquitetura, escopo, prioridades e o roadmap.

## Estado Atual

O repositorio foi inicializado com:

- estrutura base de monorepo TypeScript
- CLI local para `scan`
- pacote `core` com leitura e classificacao de arquivos
- pacote `shared` com tipos iniciais do dominio

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

- controllers NestJS
- chamadas HTTP Angular
- referencias do README
