PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS scan_jobs (
  job_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  repository_path TEXT NOT NULL,
  repository_full_name TEXT,
  pull_request_number INTEGER,
  delivery_id TEXT,
  changed_files_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scan_jobs_status ON scan_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scan_jobs_repo_pr ON scan_jobs(repository_full_name, pull_request_number);

CREATE TABLE IF NOT EXISTS repository_scans (
  scan_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  produced_at TEXT NOT NULL,
  root_path TEXT NOT NULL,
  scanned_at TEXT NOT NULL,
  finding_schema_version TEXT NOT NULL,
  analysis_mode TEXT NOT NULL CHECK (analysis_mode IN ('full', 'diff')),
  analysis_scope_json TEXT NOT NULL,
  total_files INTEGER NOT NULL,
  total_artifacts INTEGER NOT NULL,
  total_relations INTEGER NOT NULL,
  total_findings INTEGER NOT NULL,
  FOREIGN KEY(job_id) REFERENCES scan_jobs(job_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_repository_scans_job_id ON repository_scans(job_id);
CREATE INDEX IF NOT EXISTS idx_repository_scans_scanned_at ON repository_scans(scanned_at DESC);

CREATE TABLE IF NOT EXISTS scan_artifacts (
  scan_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  file_path TEXT NOT NULL,
  line_number INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY(scan_id, artifact_id),
  FOREIGN KEY(scan_id) REFERENCES repository_scans(scan_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scan_artifacts_kind ON scan_artifacts(kind);
CREATE INDEX IF NOT EXISTS idx_scan_artifacts_file_path ON scan_artifacts(file_path);

CREATE TABLE IF NOT EXISTS scan_relations (
  scan_id TEXT NOT NULL,
  relation_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  source_artifact_id TEXT NOT NULL,
  target_artifact_id TEXT NOT NULL,
  confidence REAL NOT NULL,
  rationale TEXT NOT NULL,
  PRIMARY KEY(scan_id, relation_id),
  FOREIGN KEY(scan_id) REFERENCES repository_scans(scan_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scan_relations_kind ON scan_relations(kind);
CREATE INDEX IF NOT EXISTS idx_scan_relations_source ON scan_relations(source_artifact_id);
CREATE INDEX IF NOT EXISTS idx_scan_relations_target ON scan_relations(target_artifact_id);

CREATE TABLE IF NOT EXISTS scan_findings (
  scan_id TEXT NOT NULL,
  finding_id TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  confidence REAL NOT NULL,
  publishable INTEGER NOT NULL CHECK (publishable IN (0, 1)),
  user_message TEXT NOT NULL,
  file_path TEXT NOT NULL,
  related_file_path TEXT,
  evidence TEXT NOT NULL,
  suggested_fix TEXT,
  score_structural REAL NOT NULL,
  score_semantic REAL NOT NULL,
  score_diff REAL NOT NULL,
  score_history REAL NOT NULL,
  score_final REAL NOT NULL,
  score_threshold REAL NOT NULL,
  semantic_provider TEXT,
  semantic_model TEXT,
  semantic_assessment TEXT,
  semantic_explanation TEXT,
  semantic_suggested_fix TEXT,
  semantic_user_message TEXT,
  extensions_json TEXT,
  PRIMARY KEY(scan_id, finding_id),
  FOREIGN KEY(scan_id) REFERENCES repository_scans(scan_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_findings_fingerprint
  ON scan_findings(scan_id, fingerprint);
CREATE INDEX IF NOT EXISTS idx_scan_findings_type ON scan_findings(type);
CREATE INDEX IF NOT EXISTS idx_scan_findings_severity ON scan_findings(severity);
CREATE INDEX IF NOT EXISTS idx_scan_findings_publishable ON scan_findings(publishable);
CREATE INDEX IF NOT EXISTS idx_scan_findings_file_path ON scan_findings(file_path);

CREATE TABLE IF NOT EXISTS finding_related_artifacts (
  scan_id TEXT NOT NULL,
  finding_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('primary', 'secondary', 'context')),
  position INTEGER NOT NULL,
  PRIMARY KEY(scan_id, finding_id, artifact_id),
  FOREIGN KEY(scan_id, finding_id)
    REFERENCES scan_findings(scan_id, finding_id)
    ON DELETE CASCADE,
  FOREIGN KEY(scan_id, artifact_id)
    REFERENCES scan_artifacts(scan_id, artifact_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_finding_related_artifacts_artifact
  ON finding_related_artifacts(scan_id, artifact_id);

CREATE TABLE IF NOT EXISTS pull_request_comments (
  comment_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  repository_full_name TEXT NOT NULL,
  pull_request_number INTEGER NOT NULL,
  body TEXT NOT NULL,
  published INTEGER NOT NULL CHECK (published IN (0, 1)),
  provider TEXT NOT NULL,
  remote_comment_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(job_id) REFERENCES scan_jobs(job_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pull_request_comments_job_id ON pull_request_comments(job_id);
CREATE INDEX IF NOT EXISTS idx_pull_request_comments_repo_pr
  ON pull_request_comments(repository_full_name, pull_request_number);
