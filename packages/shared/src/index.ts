export type RepositoryFileKind =
  | "source"
  | "docs"
  | "tests"
  | "config"
  | "spec"
  | "other";

export type RepositoryFileNode = {
  path: string;
  extension: string | null;
  kind: RepositoryFileKind;
};

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD"
  | "ALL";

export type RepositoryArtifactKind =
  | "nestjs_controller"
  | "nestjs_endpoint"
  | "angular_http_call"
  | "readme_reference"
  | "package_script"
  | "env_usage"
  | "env_definition";

export type RepositoryArtifactBase = {
  id: string;
  kind: RepositoryArtifactKind;
  source: "nestjs" | "angular" | "readme" | "config" | "generic";
  file: string;
  line: number;
};

export type NestControllerArtifact = RepositoryArtifactBase & {
  kind: "nestjs_controller";
  className: string;
  basePath: string;
};

export type NestEndpointArtifact = RepositoryArtifactBase & {
  kind: "nestjs_endpoint";
  controllerId: string;
  controllerName: string;
  method: HttpMethod;
  path: string;
  fullPath: string;
  handlerName: string;
  commentSummary: string | null;
  requestDto: string | null;
  requestShape: string[] | null;
  responseType: string | null;
  responseShape: string[] | null;
};

export type AngularHttpCallArtifact = RepositoryArtifactBase & {
  kind: "angular_http_call";
  className: string;
  memberName: string;
  method: Exclude<HttpMethod, "ALL">;
  httpClientName: string;
  urlExpression: string;
  normalizedPath: string | null;
  payloadShape: string[] | null;
  responseType: string | null;
  responseShape: string[] | null;
};

export type ReadmeReferenceKind = "endpoint" | "command" | "env";

export type ReadmeReferenceArtifact = RepositoryArtifactBase & {
  kind: "readme_reference";
  source: "readme";
  referenceKind: ReadmeReferenceKind;
  section: string | null;
  value: string;
  method: Exclude<HttpMethod, "ALL"> | null;
  normalizedPath: string | null;
};

export type PackageScriptArtifact = RepositoryArtifactBase & {
  kind: "package_script";
  source: "config";
  packageName: string | null;
  scriptName: string;
  command: string;
};

export type EnvUsageArtifact = RepositoryArtifactBase & {
  kind: "env_usage";
  source: "generic";
  variableName: string;
  accessPattern: "process.env" | "import.meta.env";
};

export type EnvDefinitionArtifact = RepositoryArtifactBase & {
  kind: "env_definition";
  source: "config";
  variableName: string;
};

export type RepositoryArtifact =
  | NestControllerArtifact
  | NestEndpointArtifact
  | AngularHttpCallArtifact
  | ReadmeReferenceArtifact
  | PackageScriptArtifact
  | EnvUsageArtifact
  | EnvDefinitionArtifact;

export type RepositoryRelationKind =
  | "angular_consumes_nest_endpoint"
  | "readme_mentions_nest_endpoint"
  | "readme_mentions_package_script"
  | "readme_mentions_env_var";

export type RepositoryRelation = {
  id: string;
  kind: RepositoryRelationKind;
  sourceArtifactId: string;
  targetArtifactId: string;
  confidence: number;
  rationale: string;
};

export type ConsistencyGraphNodeKind = "artifact" | "finding";

export type ConsistencyGraphNode = {
  id: string;
  kind: ConsistencyGraphNodeKind;
  artifactKind: RepositoryArtifactKind | null;
  findingType: DriftType | null;
  file: string;
  line: number | null;
  label: string;
};

export type ConsistencyGraphEdgeKind =
  | RepositoryRelationKind
  | "finding_impacts_artifact";

export type ConsistencyGraphEdge = {
  id: string;
  kind: ConsistencyGraphEdgeKind;
  sourceNodeId: string;
  targetNodeId: string;
  confidence: number;
  rationale: string;
};

export type ConsistencyGraph = {
  nodes: ConsistencyGraphNode[];
  edges: ConsistencyGraphEdge[];
};

export type DriftSeverity = "critical" | "high" | "medium" | "low";

export type DriftType =
  | "comment_drift"
  | "documentation_drift"
  | "api_contract_drift"
  | "config_drift"
  | "test_drift";

export type FindingSchemaVersion = "finding.v1";

export type FindingRelatedArtifactRole = "primary" | "secondary" | "context";

export type FindingRelatedArtifact = {
  artifactId: string;
  role: FindingRelatedArtifactRole;
};

export type FindingScore = {
  structural: number;
  semantic: number;
  diff: number;
  history: number;
  final: number;
  threshold: number;
};

export type SemanticAssessment = "aligned" | "contradictory" | "uncertain";

export type SemanticReview = {
  provider: "ollama" | "custom";
  model: string;
  explanation: string;
  semanticAssessment: SemanticAssessment;
  suggestedFix: string | null;
  userMessage: string;
};

export type Finding = {
  id: string;
  schemaVersion: FindingSchemaVersion;
  ruleVersion: string;
  fingerprint: string;
  type: DriftType;
  severity: DriftSeverity;
  confidence: number;
  score: FindingScore;
  publishable: boolean;
  userMessage: string;
  file: string;
  relatedFile?: string;
  relatedArtifactIds: string[];
  relatedArtifacts: FindingRelatedArtifact[];
  evidence: string;
  suggestedFix?: string;
  semanticReview?: SemanticReview;
  extensions?: Record<string, unknown>;
};

export type RepositoryAnalysisScope =
  | {
      mode: "full";
    }
  | {
      mode: "diff";
      changedFiles: string[];
      impactExpansionDepth: number;
      impactedArtifactIds: string[];
      impactedFiles: string[];
    };

export type RepositoryScanSummary = {
  rootPath: string;
  scannedAt: string;
  findingSchemaVersion: FindingSchemaVersion;
  compatibleFindingSchemaVersions: FindingSchemaVersion[];
  analysisScope: RepositoryAnalysisScope;
  totalFiles: number;
  byKind: Record<RepositoryFileKind, number>;
  files: RepositoryFileNode[];
  totalArtifacts: number;
  artifactCounts: Record<RepositoryArtifactKind, number>;
  artifacts: RepositoryArtifact[];
  totalRelations: number;
  relationCounts: Record<RepositoryRelationKind, number>;
  relations: RepositoryRelation[];
  graph: ConsistencyGraph;
  totalFindings: number;
  findingCounts: Record<DriftType, number>;
  findings: Finding[];
};
