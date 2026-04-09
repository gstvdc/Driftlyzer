export type RepositoryFileKind =
  | 'source'
  | 'docs'
  | 'tests'
  | 'config'
  | 'spec'
  | 'other';

export type RepositoryFileNode = {
  path: string;
  extension: string | null;
  kind: RepositoryFileKind;
};

export type RepositoryScanSummary = {
  rootPath: string;
  scannedAt: string;
  totalFiles: number;
  byKind: Record<RepositoryFileKind, number>;
  files: RepositoryFileNode[];
};

export type DriftSeverity = 'critical' | 'high' | 'medium' | 'low';

export type DriftType =
  | 'comment_drift'
  | 'documentation_drift'
  | 'api_contract_drift'
  | 'config_drift'
  | 'test_drift';

export type Finding = {
  type: DriftType;
  severity: DriftSeverity;
  confidence: number;
  file: string;
  relatedFile?: string;
  evidence: string;
  suggestedFix?: string;
};
