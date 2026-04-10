import type {
  Finding,
  RepositoryArtifact,
  RepositoryRelation,
  RepositoryScanSummary,
} from "@drift/shared";

export type PersistedScanEnvelope = {
  scanId: string;
  jobId: string;
  producedAt: string;
  summary: RepositoryScanSummary;
};

export type PersistedCommentEnvelope = {
  commentId: string;
  jobId: string;
  repositoryFullName: string;
  pullRequestNumber: number;
  body: string;
  published: boolean;
  provider: string;
  remoteCommentId?: string;
  createdAt: string;
  updatedAt: string;
};

export type DriftlyzerScanWriteModel = {
  scanId: string;
  jobId: string;
  producedAt: string;
  findings: Finding[];
  artifacts: RepositoryArtifact[];
  relations: RepositoryRelation[];
  summary: RepositoryScanSummary;
};

export type DriftlyzerPersistenceAdapter = {
  saveScanJob: (job: {
    jobId: string;
    createdAt: string;
    updatedAt: string;
    status: "pending" | "processing" | "completed" | "failed";
    repositoryPath: string;
    repositoryFullName?: string;
    pullRequestNumber?: number;
    deliveryId?: string;
    installationId?: number;
    changedFiles: string[];
  }) => Promise<void>;
  saveScanReport: (model: DriftlyzerScanWriteModel) => Promise<void>;
  savePullRequestComment: (comment: PersistedCommentEnvelope) => Promise<void>;
  listLatestScanEnvelopes: (limit: number) => Promise<PersistedScanEnvelope[]>;
  readScanEnvelopeByJobId: (
    jobId: string,
  ) => Promise<PersistedScanEnvelope | null>;
};
