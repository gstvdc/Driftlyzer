import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { RepositoryScanSummary } from "@drift/shared";

export type ScanJobStatus = "pending" | "processing" | "completed" | "failed";

export type PersistedScanJob = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: ScanJobStatus;
  repositoryPath: string;
  changedFiles: string[];
  repositoryFullName?: string;
  pullRequestNumber?: number;
  deliveryId?: string;
};

export type PersistedFindingsReport = {
  job: PersistedScanJob;
  producedAt: string;
  summary: RepositoryScanSummary;
  pullRequestCommentBody: string;
};

export function createScanJob(input: {
  repositoryPath: string;
  changedFiles: string[];
  repositoryFullName?: string;
  pullRequestNumber?: number;
  deliveryId?: string;
}): PersistedScanJob {
  const now = new Date().toISOString();
  const idBase = input.deliveryId?.trim() || "job";

  return {
    id: `${idBase}-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
    status: "pending",
    repositoryPath: input.repositoryPath,
    changedFiles: input.changedFiles,
    repositoryFullName: input.repositoryFullName,
    pullRequestNumber: input.pullRequestNumber,
    deliveryId: input.deliveryId,
  };
}

export async function persistScanJob(
  storageRoot: string,
  job: PersistedScanJob,
): Promise<void> {
  const jobsDir = path.join(storageRoot, "jobs");
  await mkdir(jobsDir, { recursive: true });
  await writeFile(
    path.join(jobsDir, `${job.id}.json`),
    JSON.stringify(job, null, 2),
    "utf8",
  );
}

export async function readScanJob(
  storageRoot: string,
  jobId: string,
): Promise<PersistedScanJob> {
  const content = await readFile(
    path.join(storageRoot, "jobs", `${jobId}.json`),
    "utf8",
  );

  return JSON.parse(content) as PersistedScanJob;
}

export async function listPendingScanJobs(
  storageRoot: string,
): Promise<PersistedScanJob[]> {
  const jobsDir = path.join(storageRoot, "jobs");
  await mkdir(jobsDir, { recursive: true });
  const entries = await readdir(jobsDir);
  const jobs = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .map(async (entry) => {
        const content = await readFile(path.join(jobsDir, entry), "utf8");
        return JSON.parse(content) as PersistedScanJob;
      }),
  );

  return jobs.filter((job) => job.status === "pending");
}

export async function markScanJobStatus(
  storageRoot: string,
  job: PersistedScanJob,
  status: ScanJobStatus,
): Promise<PersistedScanJob> {
  const updated: PersistedScanJob = {
    ...job,
    status,
    updatedAt: new Date().toISOString(),
  };

  await persistScanJob(storageRoot, updated);
  return updated;
}

export async function persistFindingsReport(
  storageRoot: string,
  report: PersistedFindingsReport,
): Promise<void> {
  const findingsDir = path.join(storageRoot, "findings");
  await mkdir(findingsDir, { recursive: true });
  await writeFile(
    path.join(findingsDir, `${report.job.id}.json`),
    JSON.stringify(report, null, 2),
    "utf8",
  );
}

export async function readFindingsReport(
  storageRoot: string,
  jobId: string,
): Promise<PersistedFindingsReport> {
  const content = await readFile(
    path.join(storageRoot, "findings", `${jobId}.json`),
    "utf8",
  );

  return JSON.parse(content) as PersistedFindingsReport;
}

export async function listFindingsReports(
  storageRoot: string,
): Promise<PersistedFindingsReport[]> {
  const findingsDir = path.join(storageRoot, "findings");
  await mkdir(findingsDir, { recursive: true });
  const entries = await readdir(findingsDir);
  const reports = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .map(async (entry) => {
        const content = await readFile(path.join(findingsDir, entry), "utf8");
        return JSON.parse(content) as PersistedFindingsReport;
      }),
  );

  return reports.sort((left, right) =>
    right.producedAt.localeCompare(left.producedAt),
  );
}
