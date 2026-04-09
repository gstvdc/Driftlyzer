# Drift Guardian Project Context

Este arquivo e o contexto canônico do projeto. Antes de evoluir arquitetura, detectores ou integracoes, releia este documento e trate-o como a fonte principal de verdade sobre escopo, prioridades e decisoes.

## Objetivo

Construir um analisador de consistencia continua para repositorios, com foco inicial em projetos Angular + NestJS. O produto deve detectar drift entre codigo, contratos, consumidores, comentarios e documentacao, priorizando analise estrutural e usando LLM apenas para validacao semantica e explicacao.

## Problema Definido

O sistema deve classificar findings com:

- `type`
- `severity`
- `confidence`
- `evidence`
- `suggested_fix`

Taxonomia inicial de drift:

- `comment_drift`: comentario ou docstring nao representa mais o codigo.
- `documentation_drift`: README ou docs estao desatualizados.
- `api_contract_drift`: backend, spec ou frontend divergiram.
- `config_drift`: `.env`, README e uso real nao batem.
- `test_drift`: teste ainda reflete um comportamento antigo.

## Principios de Arquitetura

1. A fonte primaria da verdade nunca sera o LLM.
2. A deteccao deve priorizar AST, tipos, spec, diff e relacoes explicitas.
3. O LLM entra apenas onde houver ambiguidade semantica.
4. O escopo impactado pelo diff deve ser priorizado antes da auditoria completa.
5. Findings so devem ser publicados automaticamente quando houver evidencia suficiente.

## Arquitetura Alvo

Camadas principais:

1. Orquestrador de analise
2. Pipeline de indexacao estrutural
3. Grafo de consistencia
4. Detectores deterministicos
5. Revisao semantica com LLM
6. Saida em PR, relatorio e dashboard

Stack alvo:

- Monorepo TypeScript
- NestJS para API/orchestrator
- Worker separado para analises pesadas
- PostgreSQL para scans, artefatos e findings
- Redis + BullMQ para fila
- Tree-sitter para parsing estrutural
- Semgrep como complemento opcional
- OpenAPI como contrato central quando existir spec

## Escopo Inicial

Primeiro recorte valido:

### Backend NestJS <-> Frontend Angular

Detectar:

- rota mudou e o frontend ainda chama a antiga
- DTO mudou e a interface ou consumo do frontend nao acompanhou
- campo foi renomeado no backend e o frontend ficou antigo

### Codigo <-> Comentarios / README

Detectar:

- comentario descreve comportamento antigo
- README referencia rota, script ou variavel inexistente
- payload de exemplo esta desatualizado

## Modelo de Severidade

- `critical`: quebra de contrato, auth ou permissao errada, documentacao que induz uso incorreto
- `high`: DTO divergente, campo renomeado, fluxo invalido no README
- `medium`: comentario enganoso, exemplo JSON antigo, setup incompleto
- `low`: nomenclatura inconsistente, redundancia, detalhe nao funcional

## Estrategia Contra Falsos Positivos

Publicar automaticamente apenas quando o score final ultrapassar o threshold configurado.

Composicao inicial sugerida:

- `40%` regra estrutural
- `30%` proximidade semantica
- `20%` diff recente
- `10%` historico do arquivo

## Roadmap de Implementacao

### Fase 0

Definir taxonomia, severidade, exemplos positivos e falso-positivos.

### Fase 1

Entregavel: CLI local.

Construir:

- leitor do repositorio
- classificador de arquivos
- parser TS basico
- extrator de controllers NestJS
- extrator de chamadas HTTP Angular
- extrator de README

### Fase 2

Entregavel: grafo de consistencia.

Conectar:

- `Comment -> Function`
- `ReadmeSection -> Endpoint`
- `AngularServiceCall -> Endpoint`
- `DTO -> Endpoint`

### Fase 3

Entregavel: detectores deterministicos.

Prioridade:

- frontend <-> backend
- README <-> endpoint
- README <-> scripts/envs
- comentario <-> codigo
- OpenAPI <-> implementacao

### Fase 4

Entregavel: revisor semantico com saida estruturada em JSON.

Uso permitido do LLM:

- validar suspeitas ambiguas
- explicar divergencia
- sugerir correcao

### Fase 5

Entregavel: integracao com PR e comentario automatico.

### Fase 6

Entregavel: auditoria periodica da `main`.

### Fase 7

Entregavel: dashboard historico.

## Estrutura de Repositorio Desejada

```text
apps/
  cli/
  api/
  worker/
  dashboard/
packages/
  core/
  parsers/
  shared/
  integrations/
  llm/
infra/
  github-actions/
docs/
  decisions/
```

## Estado Atual

Bootstrap inicial do monorepo com:

- documento de contexto do projeto
- CLI local de `scan`
- pacote `core` para leitura e classificacao de arquivos
- pacote `shared` para tipos iniciais

## Proximos Passos Imediatos

1. Implementar extrator estrutural de controllers NestJS.
2. Implementar extrator de chamadas HTTP em Angular.
3. Implementar extrator de referencias do README.
4. Produzir o primeiro `scan` com artefatos normalizados.
5. Em seguida, atacar o detector `frontend <-> backend`.
