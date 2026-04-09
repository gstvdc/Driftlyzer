import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  extractAngularHttpArtifactsFromTypeScriptFile,
  extractEnvDefinitionsFromEnvFile,
  extractEnvUsagesFromSourceFile,
  extractNestArtifactsFromTypeScriptFile,
  extractPackageScriptsFromPackageJsonFile,
  extractReadmeArtifactsFromMarkdownFile,
} from "@drift/parsers";
import {
  createOllamaSemanticReviewer,
  type SemanticReviewer,
} from "@drift/llm";
import type {
  AngularHttpCallArtifact,
  ConsistencyGraph,
  DriftType,
  EnvDefinitionArtifact,
  EnvUsageArtifact,
  Finding,
  FindingRelatedArtifact,
  FindingSchemaVersion,
  NestEndpointArtifact,
  PackageScriptArtifact,
  ReadmeReferenceArtifact,
  RepositoryArtifact,
  RepositoryAnalysisScope,
  RepositoryArtifactKind,
  RepositoryFileKind,
  RepositoryFileNode,
  RepositoryRelation,
  RepositoryRelationKind,
  RepositoryScanSummary,
} from "@drift/shared";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
]);

const EMPTY_KIND_COUNTS: Record<RepositoryFileKind, number> = {
  source: 0,
  docs: 0,
  tests: 0,
  config: 0,
  spec: 0,
  other: 0,
};

const EMPTY_ARTIFACT_COUNTS: Record<RepositoryArtifactKind, number> = {
  nestjs_controller: 0,
  nestjs_endpoint: 0,
  angular_http_call: 0,
  readme_reference: 0,
  package_script: 0,
  env_usage: 0,
  env_definition: 0,
};

const EMPTY_RELATION_COUNTS: Record<RepositoryRelationKind, number> = {
  angular_consumes_nest_endpoint: 0,
  readme_mentions_nest_endpoint: 0,
  readme_mentions_package_script: 0,
  readme_mentions_env_var: 0,
};

const EMPTY_FINDING_COUNTS: Record<DriftType, number> = {
  comment_drift: 0,
  documentation_drift: 0,
  api_contract_drift: 0,
  config_drift: 0,
  test_drift: 0,
};

const DOC_FILE_PATTERN = /\.(md|mdx|rst|txt)$/i;
const TEST_FILE_PATTERN =
  /(^|\/)(__tests__|tests?)\/|(\.|-)(test|spec)\.(ts|tsx|js|jsx)$/i;
const SPEC_FILE_PATTERN = /(openapi|swagger).*\.(json|ya?ml)$/i;
const SOURCE_FILE_PATTERN = /\.(ts|tsx|js|jsx)$/i;
const CONFIG_FILE_PATTERN =
  /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig.*\.json|nest-cli\.json|angular\.json|eslint.*|prettier.*|docker-compose.*|\.gitignore|\.env(\..+)?|\.github\/workflows\/.+\.(yml|yaml))$/i;
const COMMENT_ENDPOINT_HINT_PATTERN =
  /\b(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(\/[A-Za-z0-9_./:{}-]*)/i;
const DEFAULT_PUBLISH_THRESHOLD = 0.75;
const DEFAULT_SEMANTIC_BASELINE = 0.6;
const DEFAULT_DIFF_SIGNAL = 0.5;
const DEFAULT_HISTORY_SIGNAL = 0.5;
const FINDING_SCHEMA_VERSION: FindingSchemaVersion = "finding.v1";
const COMPATIBLE_FINDING_SCHEMA_VERSIONS: FindingSchemaVersion[] = [
  FINDING_SCHEMA_VERSION,
];

const RULE_VERSION_BY_TYPE: Record<DriftType, string> = {
  comment_drift: "comment_drift@1.0.0",
  documentation_drift: "documentation_drift@1.0.0",
  api_contract_drift: "api_contract_drift@1.0.0",
  config_drift: "config_drift@1.0.0",
  test_drift: "test_drift@1.0.0",
};

type FindingDraft = {
  type: DriftType;
  severity: Finding["severity"];
  confidence: number;
  file: string;
  relatedFile?: string;
  relatedArtifactIds: string[];
  evidence: string;
  suggestedFix?: string;
};

type DiffPrecisionOptions = {
  changedFiles: string[];
  impactExpansionDepth?: number;
};

type DiffImpactSummary = Extract<RepositoryAnalysisScope, { mode: "diff" }>;

type NormalizedDiffPrecisionOptions = {
  changedFiles: string[];
  changedFileSet: Set<string>;
  impactExpansionDepth: number;
};

export type ScanScoringOptions = {
  publishThreshold?: number;
  semanticBaseline?: number;
  diffSignal?: number;
  historySignal?: number;
};

export type ScanSemanticReviewOptions = {
  enabled?: boolean;
  reviewer?: SemanticReviewer;
  model?: string;
  baseUrl?: string;
  temperature?: number;
  timeoutMs?: number;
  onlyFindingTypes?: DriftType[];
  minScoreForReview?: number;
  maxScoreForReview?: number;
};

export type ScanRepositoryOptions = {
  scoring?: ScanScoringOptions;
  precision?: {
    diff?: DiffPrecisionOptions;
  };
  semanticReview?: ScanSemanticReviewOptions;
};

export type {
  RepositoryFileKind,
  RepositoryFileNode,
  RepositoryScanSummary,
} from "@drift/shared";

export function classifyRepositoryFile(
  relativePath: string,
): RepositoryFileKind {
  const normalized = relativePath.split(path.sep).join("/");
  const lowerPath = normalized.toLowerCase();

  if (SPEC_FILE_PATTERN.test(lowerPath)) {
    return "spec";
  }

  if (TEST_FILE_PATTERN.test(lowerPath)) {
    return "tests";
  }

  if (CONFIG_FILE_PATTERN.test(lowerPath)) {
    return "config";
  }

  if (DOC_FILE_PATTERN.test(lowerPath)) {
    return "docs";
  }

  if (SOURCE_FILE_PATTERN.test(lowerPath)) {
    return "source";
  }

  return "other";
}

export async function scanRepository(
  rootPath: string,
  options: ScanRepositoryOptions = {},
): Promise<RepositoryScanSummary> {
  const absoluteRoot = path.resolve(rootPath);
  const files = (await walkDirectory(absoluteRoot, absoluteRoot)).sort(
    (left, right) => left.path.localeCompare(right.path),
  );
  const byKind = { ...EMPTY_KIND_COUNTS };
  const artifacts = await extractRepositoryArtifacts(absoluteRoot, files);
  const artifactCounts = { ...EMPTY_ARTIFACT_COUNTS };
  const relations = buildRepositoryRelations(artifacts);
  const relationCounts = { ...EMPTY_RELATION_COUNTS };
  const findingBuildResult = await buildFindings(artifacts, relations, options);
  const findings = findingBuildResult.findings;
  const graph = buildConsistencyGraph(artifacts, relations, findings);
  const findingCounts = { ...EMPTY_FINDING_COUNTS };

  for (const file of files) {
    byKind[file.kind] += 1;
  }

  for (const artifact of artifacts) {
    artifactCounts[artifact.kind] += 1;
  }

  for (const relation of relations) {
    relationCounts[relation.kind] += 1;
  }

  for (const finding of findings) {
    findingCounts[finding.type] += 1;
  }

  return {
    rootPath: absoluteRoot,
    scannedAt: new Date().toISOString(),
    findingSchemaVersion: FINDING_SCHEMA_VERSION,
    compatibleFindingSchemaVersions: [...COMPATIBLE_FINDING_SCHEMA_VERSIONS],
    analysisScope: findingBuildResult.analysisScope,
    totalFiles: files.length,
    byKind,
    files,
    totalArtifacts: artifacts.length,
    artifactCounts,
    artifacts,
    totalRelations: relations.length,
    relationCounts,
    relations,
    graph,
    totalFindings: findings.length,
    findingCounts,
    findings,
  };
}

async function extractRepositoryArtifacts(
  rootPath: string,
  files: RepositoryFileNode[],
): Promise<RepositoryArtifact[]> {
  const analyzableFiles = files.filter(
    (file) =>
      (file.kind === "source" && file.extension === ".ts") ||
      (file.kind === "docs" && file.extension === ".md") ||
      (file.kind === "config" &&
        (file.path.endsWith("package.json") || isEnvFilePath(file.path))),
  );
  const artifactGroups = await Promise.all(
    analyzableFiles.map(async (file) => {
      const absolutePath = path.join(rootPath, file.path);
      const content = await readFile(absolutePath, "utf8");

      if (file.kind === "docs") {
        return extractReadmeArtifactsFromMarkdownFile({
          filePath: file.path,
          content,
        });
      }

      if (file.kind === "config" && file.path.endsWith("package.json")) {
        return extractPackageScriptsFromPackageJsonFile({
          filePath: file.path,
          content,
        });
      }

      if (file.kind === "config" && isEnvFilePath(file.path)) {
        return extractEnvDefinitionsFromEnvFile({
          filePath: file.path,
          content,
        });
      }

      return extractNestArtifactsFromTypeScriptFile({
        filePath: file.path,
        content,
      }).concat(
        extractAngularHttpArtifactsFromTypeScriptFile({
          filePath: file.path,
          content,
        }),
        extractEnvUsagesFromSourceFile({
          filePath: file.path,
          content,
        }),
      );
    }),
  );

  return artifactGroups
    .flat()
    .sort(
      (left: RepositoryArtifact, right: RepositoryArtifact) =>
        left.file.localeCompare(right.file) || left.line - right.line,
    );
}

function buildRepositoryRelations(
  artifacts: RepositoryArtifact[],
): RepositoryRelation[] {
  const nestEndpoints = artifacts.filter(
    (artifact): artifact is NestEndpointArtifact =>
      artifact.kind === "nestjs_endpoint",
  );
  const angularCalls = artifacts.filter(
    (artifact): artifact is AngularHttpCallArtifact =>
      artifact.kind === "angular_http_call",
  );
  const readmeReferences = artifacts.filter(
    (artifact): artifact is ReadmeReferenceArtifact =>
      artifact.kind === "readme_reference" &&
      artifact.referenceKind === "endpoint",
  );
  const readmeCommandReferences = artifacts.filter(
    (artifact): artifact is ReadmeReferenceArtifact =>
      artifact.kind === "readme_reference" &&
      artifact.referenceKind === "command",
  );
  const readmeEnvReferences = artifacts.filter(
    (artifact): artifact is ReadmeReferenceArtifact =>
      artifact.kind === "readme_reference" && artifact.referenceKind === "env",
  );
  const packageScripts = artifacts.filter(
    (artifact): artifact is PackageScriptArtifact =>
      artifact.kind === "package_script",
  );
  const envDefinitions = artifacts.filter(
    (artifact): artifact is EnvDefinitionArtifact =>
      artifact.kind === "env_definition",
  );
  const envUsages = artifacts.filter(
    (artifact): artifact is EnvUsageArtifact => artifact.kind === "env_usage",
  );
  const relations: RepositoryRelation[] = [];

  for (const angularCall of angularCalls) {
    const match = findBestNestEndpointMatch(angularCall, nestEndpoints);

    if (!match) {
      continue;
    }

    relations.push({
      id: `relation:angular:${angularCall.id}->${match.id}`,
      kind: "angular_consumes_nest_endpoint",
      sourceArtifactId: angularCall.id,
      targetArtifactId: match.id,
      confidence: 0.9,
      rationale:
        "HTTP method matches and the normalized Angular path resolves to the same NestJS endpoint path.",
    });
  }

  for (const readmeReference of readmeReferences) {
    const match = findBestNestEndpointMatch(readmeReference, nestEndpoints);

    if (!match) {
      continue;
    }

    relations.push({
      id: `relation:readme:${readmeReference.id}->${match.id}`,
      kind: "readme_mentions_nest_endpoint",
      sourceArtifactId: readmeReference.id,
      targetArtifactId: match.id,
      confidence: readmeReference.method ? 0.88 : 0.72,
      rationale: readmeReference.method
        ? "README reference matches the endpoint method and normalized path."
        : "README reference matches the endpoint path.",
    });
  }

  for (const readmeCommandReference of readmeCommandReferences) {
    const match = findMatchingPackageScript(
      readmeCommandReference,
      packageScripts,
    );

    if (!match) {
      continue;
    }

    relations.push({
      id: `relation:readme-command:${readmeCommandReference.id}->${match.id}`,
      kind: "readme_mentions_package_script",
      sourceArtifactId: readmeCommandReference.id,
      targetArtifactId: match.id,
      confidence: 0.95,
      rationale: "README command maps directly to a package.json script.",
    });
  }

  for (const readmeEnvReference of readmeEnvReferences) {
    const match = findMatchingEnvArtifact(
      readmeEnvReference,
      envDefinitions,
      envUsages,
    );

    if (!match) {
      continue;
    }

    relations.push({
      id: `relation:readme-env:${readmeEnvReference.id}->${match.id}`,
      kind: "readme_mentions_env_var",
      sourceArtifactId: readmeEnvReference.id,
      targetArtifactId: match.id,
      confidence: match.kind === "env_definition" ? 0.92 : 0.84,
      rationale:
        match.kind === "env_definition"
          ? "README environment variable is defined in an env file."
          : "README environment variable is referenced by the codebase.",
    });
  }

  return relations;
}

async function buildFindings(
  artifacts: RepositoryArtifact[],
  relations: RepositoryRelation[],
  options: ScanRepositoryOptions,
): Promise<{ findings: Finding[]; analysisScope: RepositoryAnalysisScope }> {
  const drafts = buildFindingDrafts(artifacts, relations);
  const artifactById = new Map(
    artifacts.map((artifact) => [artifact.id, artifact]),
  );
  const normalizedDiffOptions = options.precision?.diff
    ? normalizeDiffPrecisionOptions(options.precision.diff)
    : null;
  const scoredFindings = applyDeterministicScore(
    drafts,
    options.scoring,
    normalizedDiffOptions,
    artifactById,
  );
  const diffFiltered = normalizedDiffOptions
    ? filterFindingsByDiffImpact(
        scoredFindings,
        artifacts,
        relations,
        normalizedDiffOptions,
      )
    : null;
  const reviewedFindings = await applySemanticReview(
    diffFiltered?.findings ?? scoredFindings,
    options.semanticReview,
  );

  return {
    findings: reviewedFindings,
    analysisScope: diffFiltered?.analysisScope ?? { mode: "full" },
  };
}

function buildFindingDrafts(
  artifacts: RepositoryArtifact[],
  relations: RepositoryRelation[],
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  const relatedSourceIds = new Set(
    relations.map((relation) => relation.sourceArtifactId),
  );
  const relatedTargetIds = new Set(
    relations.map((relation) => relation.targetArtifactId),
  );
  const artifactById = new Map(
    artifacts.map((artifact) => [artifact.id, artifact]),
  );
  const nestEndpoints = artifacts.filter(
    (artifact): artifact is NestEndpointArtifact =>
      artifact.kind === "nestjs_endpoint",
  );
  const angularCalls = artifacts.filter(
    (artifact): artifact is AngularHttpCallArtifact =>
      artifact.kind === "angular_http_call",
  );
  const readmeEndpointReferences = artifacts.filter(
    (artifact): artifact is ReadmeReferenceArtifact =>
      artifact.kind === "readme_reference" &&
      artifact.referenceKind === "endpoint",
  );
  const readmeCommandReferences = artifacts.filter(
    (artifact): artifact is ReadmeReferenceArtifact =>
      artifact.kind === "readme_reference" &&
      artifact.referenceKind === "command",
  );
  const readmeEnvReferences = artifacts.filter(
    (artifact): artifact is ReadmeReferenceArtifact =>
      artifact.kind === "readme_reference" && artifact.referenceKind === "env",
  );

  for (const angularCall of angularCalls) {
    const matchedEndpoint = findMatchedNestEndpoint(
      angularCall,
      relations,
      artifactById,
    );

    if (matchedEndpoint) {
      const responseMismatch = compareShapes(
        angularCall.responseShape,
        matchedEndpoint.responseShape,
      );

      if (responseMismatch) {
        findings.push({
          type: "api_contract_drift",
          severity: "high",
          confidence: 0.89,
          file: angularCall.file,
          relatedFile: matchedEndpoint.file,
          relatedArtifactIds: [angularCall.id, matchedEndpoint.id],
          evidence: `Response shape mismatch for ${angularCall.method} ${angularCall.normalizedPath ?? angularCall.urlExpression}: frontend expects [${responseMismatch.expected.join(", ")}] but backend exposes [${responseMismatch.actual.join(", ")}].`,
          suggestedFix:
            "Atualizar a tipagem/consumo no frontend ou alinhar o DTO/resposta no backend.",
        });
      }

      const requestMismatch = compareShapes(
        angularCall.payloadShape,
        matchedEndpoint.requestShape,
      );

      if (requestMismatch) {
        findings.push({
          type: "api_contract_drift",
          severity: "high",
          confidence: 0.88,
          file: angularCall.file,
          relatedFile: matchedEndpoint.file,
          relatedArtifactIds: [angularCall.id, matchedEndpoint.id],
          evidence: `Request shape mismatch for ${angularCall.method} ${angularCall.normalizedPath ?? angularCall.urlExpression}: frontend sends [${requestMismatch.expected.join(", ")}] but backend expects [${requestMismatch.actual.join(", ")}].`,
          suggestedFix:
            "Atualizar o payload do frontend ou alinhar o DTO de entrada do backend.",
        });
      }
    }

    if (relatedSourceIds.has(angularCall.id)) {
      continue;
    }

    findings.push({
      type: "api_contract_drift",
      severity: "high",
      confidence: 0.94,
      file: angularCall.file,
      relatedArtifactIds: [angularCall.id],
      evidence: `Angular call ${angularCall.method} ${angularCall.normalizedPath ?? angularCall.urlExpression} has no matching NestJS endpoint.`,
      suggestedFix:
        "Atualizar a rota/metodo no frontend ou revisar a implementacao do endpoint no backend.",
    });
  }

  if (angularCalls.length > 0) {
    for (const endpoint of nestEndpoints) {
      if (relatedTargetIds.has(endpoint.id)) {
        continue;
      }

      const closestAngularCall = findClosestAngularCallByPath(
        endpoint,
        angularCalls,
      );

      findings.push({
        type: "api_contract_drift",
        severity: "medium",
        confidence: 0.9,
        file: endpoint.file,
        relatedFile: closestAngularCall?.file,
        relatedArtifactIds: closestAngularCall
          ? [endpoint.id, closestAngularCall.id]
          : [endpoint.id],
        evidence: `NestJS endpoint ${endpoint.method} ${endpoint.fullPath} has no matching Angular HTTP consumer.`,
        suggestedFix:
          "Atualizar o frontend para consumir o endpoint ou remover/ajustar o endpoint obsoleto.",
      });
    }
  }

  for (const endpoint of nestEndpoints) {
    const commentHint = readCommentEndpointHint(endpoint.commentSummary);

    if (!commentHint) {
      continue;
    }

    const commentPaths = createComparablePaths(commentHint.path);
    const endpointPaths = createComparablePaths(endpoint.fullPath);
    const pathMatches = [...commentPaths].some((pathValue) =>
      endpointPaths.has(pathValue),
    );
    const methodMatches = endpoint.method === commentHint.method;

    if (pathMatches && methodMatches) {
      continue;
    }

    findings.push({
      type: "comment_drift",
      severity: "medium",
      confidence: pathMatches ? 0.86 : 0.91,
      file: endpoint.file,
      relatedArtifactIds: [endpoint.id],
      evidence: `Comment near ${endpoint.handlerName} says ${commentHint.method} ${commentHint.path}, but implementation is ${endpoint.method} ${endpoint.fullPath}.`,
      suggestedFix:
        "Atualizar o comentario para refletir o comportamento atual do endpoint.",
    });
  }

  for (const readmeReference of readmeEndpointReferences) {
    if (relatedSourceIds.has(readmeReference.id)) {
      continue;
    }

    const closestEndpoint = findClosestEndpointByPath(
      readmeReference,
      nestEndpoints,
    );

    findings.push({
      type: "documentation_drift",
      severity: "high",
      confidence: readmeReference.method ? 0.9 : 0.78,
      file: readmeReference.file,
      relatedFile: closestEndpoint?.file,
      relatedArtifactIds: closestEndpoint
        ? [readmeReference.id, closestEndpoint.id]
        : [readmeReference.id],
      evidence: `README reference ${readmeReference.value} has no matching NestJS endpoint.`,
      suggestedFix:
        "Atualizar a documentacao ou alinhar a implementacao do endpoint correspondente.",
    });
  }

  for (const readmeCommandReference of readmeCommandReferences) {
    if (relatedSourceIds.has(readmeCommandReference.id)) {
      continue;
    }

    findings.push({
      type: "documentation_drift",
      severity: "medium",
      confidence: 0.91,
      file: readmeCommandReference.file,
      relatedArtifactIds: [readmeCommandReference.id],
      evidence: `README command ${readmeCommandReference.value} has no matching package.json script.`,
      suggestedFix:
        "Atualizar o comando documentado ou alinhar os scripts do projeto.",
    });
  }

  for (const readmeEnvReference of readmeEnvReferences) {
    if (relatedSourceIds.has(readmeEnvReference.id)) {
      continue;
    }

    findings.push({
      type: "config_drift",
      severity: "medium",
      confidence: 0.87,
      file: readmeEnvReference.file,
      relatedArtifactIds: [readmeEnvReference.id],
      evidence: `README variable ${readmeEnvReference.value} is not defined in env files and was not found in code usage.`,
      suggestedFix:
        "Atualizar a documentacao, adicionar a variavel em .env.example ou revisar o uso real no codigo.",
    });
  }

  return findings.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.evidence.localeCompare(right.evidence),
  );
}

function applyDeterministicScore(
  drafts: FindingDraft[],
  options: ScanScoringOptions | undefined,
  diffOptions: NormalizedDiffPrecisionOptions | null,
  artifactById: Map<string, RepositoryArtifact>,
): Finding[] {
  const threshold = clampScore(
    options?.publishThreshold ?? DEFAULT_PUBLISH_THRESHOLD,
  );
  const semanticBaseline = clampScore(
    options?.semanticBaseline ?? DEFAULT_SEMANTIC_BASELINE,
  );
  const diffSignal = clampScore(options?.diffSignal ?? DEFAULT_DIFF_SIGNAL);
  const historySignal = clampScore(
    options?.historySignal ?? DEFAULT_HISTORY_SIGNAL,
  );

  return drafts.map((draft) => {
    const relatedArtifactIds = uniquePreserveOrder(draft.relatedArtifactIds);
    const draftWithArtifacts = {
      ...draft,
      relatedArtifactIds,
    };
    const structural = clampScore(draft.confidence);
    const resolvedDiffSignal = resolveDiffSignal(
      draftWithArtifacts,
      diffOptions,
      artifactById,
      diffSignal,
    );
    const final = computeFinalScore({
      structural,
      semantic: semanticBaseline,
      diff: resolvedDiffSignal,
      history: historySignal,
    });
    const publishable = final >= threshold;
    const ruleVersion = RULE_VERSION_BY_TYPE[draft.type];
    const fingerprint = createFindingFingerprint({
      type: draft.type,
      ruleVersion,
      file: draft.file,
      relatedFile: draft.relatedFile,
      evidence: draft.evidence,
      relatedArtifactIds,
    });

    return {
      ...draft,
      id: `${FINDING_SCHEMA_VERSION}:${draft.type}:${fingerprint}`,
      schemaVersion: FINDING_SCHEMA_VERSION,
      ruleVersion,
      fingerprint,
      score: {
        structural,
        semantic: semanticBaseline,
        diff: resolvedDiffSignal,
        history: historySignal,
        final,
        threshold,
      },
      publishable,
      userMessage: createDefaultUserMessage(draftWithArtifacts, publishable),
      relatedArtifactIds,
      relatedArtifacts: toRelatedArtifacts(relatedArtifactIds),
    };
  });
}

async function applySemanticReview(
  findings: Finding[],
  options: ScanSemanticReviewOptions | undefined,
): Promise<Finding[]> {
  if (!options?.enabled) {
    return findings;
  }

  const reviewer =
    options.reviewer ??
    createOllamaSemanticReviewer({
      model: options.model,
      baseUrl: options.baseUrl,
      temperature: options.temperature,
      timeoutMs: options.timeoutMs,
    });

  const reviewableTypes = new Set<DriftType>(
    options.onlyFindingTypes ?? ["comment_drift", "documentation_drift"],
  );
  const minScoreForReview = clampScore(
    options.minScoreForReview ?? DEFAULT_PUBLISH_THRESHOLD - 0.2,
  );
  const maxScoreForReview = clampScore(
    options.maxScoreForReview ?? DEFAULT_PUBLISH_THRESHOLD + 0.1,
  );
  const reviewedFindings: Finding[] = [];

  for (const finding of findings) {
    if (
      !shouldRunSemanticReview(
        finding,
        reviewableTypes,
        minScoreForReview,
        maxScoreForReview,
      )
    ) {
      reviewedFindings.push(finding);
      continue;
    }

    const review = await reviewer.review({
      finding: {
        type: finding.type,
        severity: finding.severity,
        file: finding.file,
        relatedFile: finding.relatedFile,
        evidence: finding.evidence,
        suggestedFix: finding.suggestedFix,
        userMessage: finding.userMessage,
      },
    });

    if (!review) {
      reviewedFindings.push(finding);
      continue;
    }

    const semanticScore = semanticAssessmentToScore(review.semanticAssessment);
    const final = computeFinalScore({
      structural: finding.score.structural,
      semantic: semanticScore,
      diff: finding.score.diff,
      history: finding.score.history,
    });
    const publishable = final >= finding.score.threshold;

    reviewedFindings.push({
      ...finding,
      score: {
        ...finding.score,
        semantic: semanticScore,
        final,
      },
      publishable,
      userMessage: review.userMessage,
      suggestedFix: review.suggestedFix ?? finding.suggestedFix,
      semanticReview: {
        provider: reviewer.provider,
        model: reviewer.model,
        explanation: review.explanation,
        semanticAssessment: review.semanticAssessment,
        suggestedFix: review.suggestedFix,
        userMessage: review.userMessage,
      },
    });
  }

  return reviewedFindings;
}

function shouldRunSemanticReview(
  finding: Finding,
  reviewableTypes: Set<DriftType>,
  minScoreForReview: number,
  maxScoreForReview: number,
): boolean {
  if (!reviewableTypes.has(finding.type)) {
    return false;
  }

  if (
    finding.type === "comment_drift" ||
    finding.type === "documentation_drift"
  ) {
    return true;
  }

  return (
    finding.score.final >= minScoreForReview &&
    finding.score.final <= maxScoreForReview
  );
}

function semanticAssessmentToScore(
  assessment: "aligned" | "contradictory" | "uncertain",
): number {
  if (assessment === "contradictory") {
    return 0.92;
  }

  if (assessment === "aligned") {
    return 0.3;
  }

  return 0.55;
}

function computeFinalScore(score: {
  structural: number;
  semantic: number;
  diff: number;
  history: number;
}): number {
  return roundScore(
    0.4 * score.structural +
      0.3 * score.semantic +
      0.2 * score.diff +
      0.1 * score.history,
  );
}

function createDefaultUserMessage(
  finding: FindingDraft,
  publishable: boolean,
): string {
  const headline = publishable
    ? "Drift detectado com alta confianca estrutural."
    : "Possivel drift detectado; revise antes de publicar.";
  const fix = finding.suggestedFix ? ` Sugestao: ${finding.suggestedFix}` : "";

  return `${headline} ${finding.evidence}${fix}`;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function normalizeDiffPrecisionOptions(
  diffOptions: DiffPrecisionOptions,
): NormalizedDiffPrecisionOptions {
  const changedFiles = uniquePreserveOrder(
    diffOptions.changedFiles.map((filePath) =>
      normalizeWorkspacePath(filePath),
    ),
  ).filter(Boolean);
  const impactExpansionDepth = Math.max(
    0,
    Math.min(4, diffOptions.impactExpansionDepth ?? 2),
  );

  return {
    changedFiles,
    changedFileSet: new Set(changedFiles),
    impactExpansionDepth,
  };
}

function filterFindingsByDiffImpact(
  findings: Finding[],
  artifacts: RepositoryArtifact[],
  relations: RepositoryRelation[],
  diffOptions: NormalizedDiffPrecisionOptions,
): { findings: Finding[]; analysisScope: DiffImpactSummary } {
  if (diffOptions.changedFiles.length === 0) {
    return {
      findings,
      analysisScope: {
        mode: "diff",
        changedFiles: [],
        impactExpansionDepth: diffOptions.impactExpansionDepth,
        impactedArtifactIds: [],
        impactedFiles: [],
      },
    };
  }

  const artifactById = new Map(
    artifacts.map((artifact) => [artifact.id, artifact]),
  );
  const seedArtifactIds = new Set(
    artifacts
      .filter((artifact) =>
        diffOptions.changedFileSet.has(normalizeWorkspacePath(artifact.file)),
      )
      .map((artifact) => artifact.id),
  );
  const adjacency = buildArtifactAdjacency(relations);
  const impactedArtifactIds = expandArtifactImpact(
    seedArtifactIds,
    adjacency,
    diffOptions.impactExpansionDepth,
  );
  const impactedFiles = uniquePreserveOrder(
    [...impactedArtifactIds]
      .map((artifactId) => artifactById.get(artifactId)?.file)
      .filter((filePath): filePath is string => typeof filePath === "string")
      .map((filePath) => normalizeWorkspacePath(filePath)),
  );
  const filteredFindings = findings.filter((finding) => {
    const findingFile = normalizeWorkspacePath(finding.file);
    const relatedFile = finding.relatedFile
      ? normalizeWorkspacePath(finding.relatedFile)
      : null;

    if (
      diffOptions.changedFileSet.has(findingFile) ||
      (relatedFile ? diffOptions.changedFileSet.has(relatedFile) : false)
    ) {
      return true;
    }

    if (
      finding.relatedArtifactIds.some((artifactId) =>
        impactedArtifactIds.has(artifactId),
      )
    ) {
      return true;
    }

    return (
      impactedFiles.includes(findingFile) ||
      (relatedFile ? impactedFiles.includes(relatedFile) : false)
    );
  });

  return {
    findings: filteredFindings,
    analysisScope: {
      mode: "diff",
      changedFiles: diffOptions.changedFiles,
      impactExpansionDepth: diffOptions.impactExpansionDepth,
      impactedArtifactIds: [...impactedArtifactIds].sort((a, b) =>
        a.localeCompare(b),
      ),
      impactedFiles: impactedFiles.sort((a, b) => a.localeCompare(b)),
    },
  };
}

function buildArtifactAdjacency(
  relations: RepositoryRelation[],
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();

  for (const relation of relations) {
    if (!adjacency.has(relation.sourceArtifactId)) {
      adjacency.set(relation.sourceArtifactId, new Set());
    }

    if (!adjacency.has(relation.targetArtifactId)) {
      adjacency.set(relation.targetArtifactId, new Set());
    }

    adjacency.get(relation.sourceArtifactId)?.add(relation.targetArtifactId);
    adjacency.get(relation.targetArtifactId)?.add(relation.sourceArtifactId);
  }

  return adjacency;
}

function expandArtifactImpact(
  seeds: Set<string>,
  adjacency: Map<string, Set<string>>,
  depth: number,
): Set<string> {
  const visited = new Set<string>(seeds);
  let frontier = new Set<string>(seeds);

  for (let step = 0; step < depth; step += 1) {
    const nextFrontier = new Set<string>();

    for (const artifactId of frontier) {
      for (const neighbor of adjacency.get(artifactId) ?? []) {
        if (visited.has(neighbor)) {
          continue;
        }

        visited.add(neighbor);
        nextFrontier.add(neighbor);
      }
    }

    if (nextFrontier.size === 0) {
      break;
    }

    frontier = nextFrontier;
  }

  return visited;
}

function resolveDiffSignal(
  draft: FindingDraft,
  diffOptions: NormalizedDiffPrecisionOptions | null,
  artifactById: Map<string, RepositoryArtifact>,
  fallbackSignal: number,
): number {
  if (!diffOptions || diffOptions.changedFiles.length === 0) {
    return fallbackSignal;
  }

  const file = normalizeWorkspacePath(draft.file);
  const relatedFile = draft.relatedFile
    ? normalizeWorkspacePath(draft.relatedFile)
    : null;

  if (
    diffOptions.changedFileSet.has(file) ||
    (relatedFile ? diffOptions.changedFileSet.has(relatedFile) : false)
  ) {
    return 0.95;
  }

  for (const artifactId of draft.relatedArtifactIds) {
    const artifact = artifactById.get(artifactId);

    if (!artifact) {
      continue;
    }

    if (diffOptions.changedFileSet.has(normalizeWorkspacePath(artifact.file))) {
      return 0.85;
    }
  }

  return 0.2;
}

function toRelatedArtifacts(
  relatedArtifactIds: string[],
): FindingRelatedArtifact[] {
  return relatedArtifactIds.map((artifactId, index) => ({
    artifactId,
    role: index === 0 ? "primary" : index === 1 ? "secondary" : "context",
  }));
}

function createFindingFingerprint(input: {
  type: DriftType;
  ruleVersion: string;
  file: string;
  relatedFile?: string;
  evidence: string;
  relatedArtifactIds: string[];
}): string {
  const payload = [
    FINDING_SCHEMA_VERSION,
    input.type,
    input.ruleVersion,
    normalizeWorkspacePath(input.file),
    input.relatedFile ? normalizeWorkspacePath(input.relatedFile) : "",
    normalizeEvidence(input.evidence),
    [...input.relatedArtifactIds].sort((a, b) => a.localeCompare(b)).join(","),
  ].join("|");

  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

function normalizeEvidence(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeWorkspacePath(filePath: string): string {
  return filePath.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function uniquePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}

function findBestNestEndpointMatch(
  artifact: Pick<
    AngularHttpCallArtifact | ReadmeReferenceArtifact,
    "method" | "normalizedPath"
  >,
  endpoints: NestEndpointArtifact[],
): NestEndpointArtifact | null {
  if (!artifact.normalizedPath) {
    return null;
  }

  const artifactCandidates = createComparablePaths(artifact.normalizedPath);

  for (const endpoint of endpoints) {
    if (!artifactCandidates.has(normalizeComparablePath(endpoint.fullPath))) {
      continue;
    }

    if (artifact.method && artifact.method !== endpoint.method) {
      continue;
    }

    return endpoint;
  }

  return null;
}

function findClosestEndpointByPath(
  artifact: Pick<ReadmeReferenceArtifact, "normalizedPath">,
  endpoints: NestEndpointArtifact[],
): NestEndpointArtifact | null {
  if (!artifact.normalizedPath) {
    return null;
  }

  const artifactPath = normalizeComparablePath(artifact.normalizedPath);

  for (const endpoint of endpoints) {
    const endpointPath = normalizeComparablePath(endpoint.fullPath);

    if (
      endpointPath.endsWith(artifactPath) ||
      artifactPath.endsWith(endpointPath)
    ) {
      return endpoint;
    }
  }

  return null;
}

function findClosestAngularCallByPath(
  endpoint: Pick<NestEndpointArtifact, "fullPath">,
  angularCalls: AngularHttpCallArtifact[],
): AngularHttpCallArtifact | null {
  const endpointCandidates = createComparablePaths(endpoint.fullPath);

  for (const angularCall of angularCalls) {
    if (!angularCall.normalizedPath) {
      continue;
    }

    const angularCandidates = createComparablePaths(angularCall.normalizedPath);

    if (
      [...angularCandidates].some((candidate) =>
        endpointCandidates.has(candidate),
      )
    ) {
      return angularCall;
    }
  }

  return null;
}

function readCommentEndpointHint(commentSummary: string | null): {
  method: Exclude<NestEndpointArtifact["method"], "ALL">;
  path: string;
} | null {
  if (!commentSummary) {
    return null;
  }

  const match = commentSummary.match(COMMENT_ENDPOINT_HINT_PATTERN);
  const method = match?.[1]?.toUpperCase() as
    | Exclude<NestEndpointArtifact["method"], "ALL">
    | undefined;
  const path = match?.[2];

  if (!method || !path) {
    return null;
  }

  return {
    method,
    path: normalizeComparablePath(path),
  };
}

function findMatchedNestEndpoint(
  angularCall: AngularHttpCallArtifact,
  relations: RepositoryRelation[],
  artifactById: Map<string, RepositoryArtifact>,
): NestEndpointArtifact | null {
  const relation = relations.find(
    (item) =>
      item.kind === "angular_consumes_nest_endpoint" &&
      item.sourceArtifactId === angularCall.id,
  );

  if (!relation) {
    return null;
  }

  const artifact = artifactById.get(relation.targetArtifactId);

  return artifact?.kind === "nestjs_endpoint" ? artifact : null;
}

function compareShapes(
  expected: string[] | null,
  actual: string[] | null,
): { expected: string[]; actual: string[] } | null {
  if (!expected || !actual) {
    return null;
  }

  if (
    expected.length === actual.length &&
    expected.every((value, index) => value === actual[index])
  ) {
    return null;
  }

  return {
    expected,
    actual,
  };
}

function buildConsistencyGraph(
  artifacts: RepositoryArtifact[],
  relations: RepositoryRelation[],
  findings: Finding[],
): ConsistencyGraph {
  const nodes: ConsistencyGraph["nodes"] = artifacts.map((artifact) => ({
    id: artifact.id,
    kind: "artifact",
    artifactKind: artifact.kind,
    findingType: null,
    file: artifact.file,
    line: artifact.line,
    label: `${artifact.kind} at ${artifact.file}:${artifact.line}`,
  }));
  const edges: ConsistencyGraph["edges"] = relations.map((relation) => ({
    id: `graph:${relation.id}`,
    kind: relation.kind,
    sourceNodeId: relation.sourceArtifactId,
    targetNodeId: relation.targetArtifactId,
    confidence: relation.confidence,
    rationale: relation.rationale,
  }));

  for (const finding of findings) {
    const findingNodeId = toFindingNodeId(finding);

    nodes.push({
      id: findingNodeId,
      kind: "finding",
      artifactKind: null,
      findingType: finding.type,
      file: finding.file,
      line: null,
      label: `${finding.type} (${finding.severity})`,
    });

    const impactedArtifacts =
      finding.relatedArtifactIds.length > 0
        ? new Set(finding.relatedArtifactIds)
        : new Set(
            artifacts
              .filter(
                (artifact) =>
                  artifact.file === finding.file ||
                  (finding.relatedFile
                    ? artifact.file === finding.relatedFile
                    : false),
              )
              .map((artifact) => artifact.id),
          );

    for (const artifactId of impactedArtifacts) {
      edges.push({
        id: `graph:finding:${finding.fingerprint}:${artifactId}`,
        kind: "finding_impacts_artifact",
        sourceNodeId: findingNodeId,
        targetNodeId: artifactId,
        confidence: finding.confidence,
        rationale: finding.evidence,
      });
    }
  }

  return {
    nodes: nodes.sort((left, right) => left.id.localeCompare(right.id)),
    edges: edges.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function toFindingNodeId(finding: Finding): string {
  return finding.id;
}

function findMatchingPackageScript(
  artifact: ReadmeReferenceArtifact,
  scripts: PackageScriptArtifact[],
): PackageScriptArtifact | null {
  const scriptName = extractScriptNameFromCommand(artifact.value);

  if (!scriptName) {
    return null;
  }

  return scripts.find((script) => script.scriptName === scriptName) ?? null;
}

function findMatchingEnvArtifact(
  artifact: ReadmeReferenceArtifact,
  definitions: EnvDefinitionArtifact[],
  usages: EnvUsageArtifact[],
): EnvDefinitionArtifact | EnvUsageArtifact | null {
  return (
    definitions.find(
      (definition) => definition.variableName === artifact.value,
    ) ??
    usages.find((usage) => usage.variableName === artifact.value) ??
    null
  );
}

function extractScriptNameFromCommand(command: string): string | null {
  const normalized = command.trim();
  const npmRunMatch = normalized.match(
    /^(?:npm|pnpm)\s+run\s+([A-Za-z0-9:_-]+)/,
  );

  if (npmRunMatch?.[1]) {
    return npmRunMatch[1];
  }

  const pnpmMatch = normalized.match(/^pnpm\s+([A-Za-z0-9:_-]+)/);

  if (pnpmMatch?.[1] && pnpmMatch[1] !== "install") {
    return pnpmMatch[1];
  }

  const yarnMatch = normalized.match(/^yarn\s+([A-Za-z0-9:_-]+)/);

  if (yarnMatch?.[1] && yarnMatch[1] !== "install" && yarnMatch[1] !== "add") {
    return yarnMatch[1];
  }

  return null;
}

function createComparablePaths(pathValue: string): Set<string> {
  const normalized = normalizeComparablePath(pathValue);
  const values = new Set<string>([normalized]);

  if (normalized === "/api") {
    values.add("/");
  }

  if (normalized.startsWith("/api/")) {
    values.add(normalized.slice(4) || "/");
  }

  return values;
}

function normalizeComparablePath(pathValue: string): string {
  const cleaned = pathValue.trim().replace(/\/+$/g, "");

  return cleaned.length > 0 ? cleaned : "/";
}

function isEnvFilePath(filePath: string): boolean {
  return /(^|\/)\.env(\..+)?$/i.test(filePath);
}

async function walkDirectory(
  currentPath: string,
  rootPath: string,
): Promise<RepositoryFileNode[]> {
  const entries = await readdir(currentPath, { withFileTypes: true });
  const files: RepositoryFileNode[] = [];

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      files.push(
        ...(await walkDirectory(path.join(currentPath, entry.name), rootPath)),
      );
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const absolutePath = path.join(currentPath, entry.name);
    const relativePath = path
      .relative(rootPath, absolutePath)
      .split(path.sep)
      .join("/");
    const extension = path.extname(entry.name) || null;

    files.push({
      path: relativePath,
      extension,
      kind: classifyRepositoryFile(relativePath),
    });
  }

  return files;
}
