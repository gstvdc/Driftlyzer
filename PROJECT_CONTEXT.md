# Driftlyzer Project Context

Este arquivo e o contexto canônico do projeto. Antes de evoluir arquitetura, detectores ou integracoes, releia este documento e trate-o como a fonte principal de verdade sobre escopo, prioridades e decisoes.

## Objetivo

Construir um analisador de consistencia continua para repositorios, com foco inicial em projetos Angular + NestJS. O produto deve detectar drift entre codigo, contratos, consumidores, comentarios e documentacao, priorizando analise estrutural e usando LLM apenas para validacao semantica e explicacao.

Diretriz de longo prazo:

- o produto nao deve ficar preso a TypeScript
- o objetivo final e suportar multiplas linguagens e multiplos frameworks
- a arquitetura deve nascer preparada para crescer por adaptadores de linguagem, nao por regras acopladas a um unico stack
- o recorte Angular + NestJS continua sendo apenas o primeiro vertical de validacao

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

## Diretriz Multi-Linguagem

Objetivo de produto:

- suportar repositorios com diferentes linguagens
- detectar drift e inconsistencias em codigo, docs, contratos, testes e configuracoes em qualquer stack relevante
- crescer de forma modular, com extratores e detectores especificos por ecossistema

Interpretacao correta de "detectar erro em tudo":

- nao significa prometer cobertura absoluta de qualquer bug em qualquer linguagem
- significa que o produto deve ser desenhado para expandir cobertura estrutural e semantica de forma progressiva, sem travar em um stack unico
- a unidade de extensao deve ser um adaptador por linguagem ou framework

Arquitetura obrigatoria para isso:

- schema normalizado de artefatos independente de linguagem
- camada de extratores por linguagem
- camada de relacoes independente de linguagem
- detectores genericos quando possivel
- detectores especificos quando o ecossistema exigir

Expansoes previstas apos o primeiro vertical:

- React
- Next.js
- Java e Spring
- Python e FastAPI
- outros stacks orientados por demanda real

## Estrategia de LLM

Recomendacao de trabalho validada em 9 de abril de 2026:

- producao: OpenAI `GPT-5.4 mini`
- desenvolvimento barato ou com free tier: Google `Gemini 2.5 Flash` ou `Gemini 2.5 Flash-Lite`
- desenvolvimento sem custo de API: Ollama local com modelos abertos

Regras:

- LLM entra apenas depois de suspeitas estruturais geradas por parser, relacoes e detectores
- o modelo deve receber contexto pequeno, estruturado e com saida em JSON
- precos e tiers devem ser conferidos novamente antes de decisao final de deploy, porque sao dados temporais

## Arquitetura de Produto

Montagem de produto considerada correta e alinhada com o objetivo do projeto:

### Nucleo

- servico backend de analise
- fila de jobs
- banco relacional
- armazenamento de findings
- integracao com LLM

### Entradas

- webhook GitHub
- GitHub Actions
- CLI local

### Saidas

- comentarios em PR
- alertas de code review
- dashboard web
- extensao de IDE opcional

Observacao importante:

- essa arquitetura de produto esta correta
- o backend de analise continua sendo o centro do sistema
- GitHub e CLI devem ser tratados como canais de entrada do mesmo engine
- dashboard e extensoes devem consumir findings e relacoes ja produzidos pelo backend, nunca reinventar a analise

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

Nota de estrategia:

- escopo inicial nao limita o produto final
- ele existe para validar o engine central, o schema de artefatos, o grafo de relacoes e a geracao de findings
- depois dessa validacao, os proximos stacks devem entrar como novos adaptadores

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

## Ordem de Produto

Ordem de superficie de produto que faz sentido para expansao:

1. engine backend
2. integracao com GitHub e PR
3. dashboard web
4. CLI
5. extensao VS Code
6. plugin JetBrains

Essa ordem e valida quando pensada como exposicao de produto e canais finais.

## Ordem de Implementacao Recomendada

Para construir com menos atrito tecnico, a ordem recomendada permanece:

1. engine backend
2. CLI local
3. integracao com GitHub e PR
4. dashboard web
5. extensao VS Code
6. plugin JetBrains

Justificativa:

- o CLI acelera teste local, debugging e validacao do engine
- integrar primeiro com GitHub sem um loop local forte desacelera iteracao
- dashboard deve entrar depois que findings, score e historico estiverem estaveis
- extensoes de IDE so valem o custo quando os findings do backend ja forem confiaveis

Regra de produto:

- toda nova interface deve ser apenas uma forma diferente de acionar ou consumir o mesmo backend de analise
- nao criar logica de deteccao separada em dashboard, extensao ou plugin
- o backend precisa continuar como fonte unica de verdade para findings, score e explicacoes

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
- pacote `parsers` com extratores AST iniciais de controllers/endpoints NestJS e chamadas HTTP Angular
- parser de README para referencias de endpoint, comando e env
- parser de `package.json` para scripts e parser de env para definicoes e usos
- `scan` retornando artefatos normalizados de controllers, endpoints, consumers HTTP Angular, referencias de README, scripts e envs
- `scan` retornando relacoes iniciais entre Angular <-> NestJS e README <-> NestJS
- `scan` retornando relacoes iniciais entre README <-> scripts e README <-> envs
- `scan` retornando findings iniciais para `api_contract_drift`, `documentation_drift` e `config_drift`
- detector `frontend <-> backend` enriquecido com comparacao inicial de shape para request e response
- suite formal de testes com fixtures versionados para cenarios alinhados e com drift

## Proximos Passos Imediatos

1. Introduzir uma camada de grafo/relations mais explicita no dominio.
2. Preparar o esqueleto de `apps/api` e `apps/worker`.
3. Enriquecer ainda mais o detector `frontend <-> backend` com suporte cross-file de tipos.
4. Expandir a suite de testes para novos stacks e novos detectores.
5. Em seguida, atacar a integracao com GitHub e comentario em PR.
