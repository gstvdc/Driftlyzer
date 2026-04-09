import type { RepositoryScanSummary } from "@drift/shared";
import type { Prisma } from "@prisma/client";

import { getPrismaClient } from "./prisma-client.js";
import type {
  PersistedFindingsReport,
  PersistedScanJob,
  ScanJobStatus,
} from "./persistence.js";

function toDate(value: string): Date {
  return new Date(value);
}

function toScanJobStatus(
  status: ScanJobStatus,
): "pending" | "processing" | "completed" | "failed" {
  return status;
}

function fromDbScanJob(input: {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  status: "pending" | "processing" | "completed" | "failed";
  repositoryPath: string;
  changedFilesJson: unknown;
  repositoryFullName: string | null;
  pullRequestNumber: number | null;
  deliveryId: string | null;
}): PersistedScanJob {
  return {
    id: input.id,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
    status: input.status,
    repositoryPath: input.repositoryPath,
    changedFiles: asStringArray(input.changedFilesJson),
    repositoryFullName: input.repositoryFullName ?? undefined,
    pullRequestNumber: input.pullRequestNumber ?? undefined,
    deliveryId: input.deliveryId ?? undefined,
  };
}

function fromDbReport(input: {
  producedAt: Date;
  summaryJson: unknown;
  pullRequestCommentBody: string;
  job: {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    status: "pending" | "processing" | "completed" | "failed";
    repositoryPath: string;
    changedFilesJson: unknown;
    repositoryFullName: string | null;
    pullRequestNumber: number | null;
    deliveryId: string | null;
  };
}): PersistedFindingsReport {
  return {
    job: fromDbScanJob(input.job),
    producedAt: input.producedAt.toISOString(),
    summary: input.summaryJson as RepositoryScanSummary,
    pullRequestCommentBody: input.pullRequestCommentBody,
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function persistScanJobPostgres(
  job: PersistedScanJob,
): Promise<void> {
  const prisma = getPrismaClient();

  await prisma.scanJob.upsert({
    where: {
      id: job.id,
    },
    create: {
      id: job.id,
      createdAt: toDate(job.createdAt),
      updatedAt: toDate(job.updatedAt),
      status: toScanJobStatus(job.status),
      repositoryPath: job.repositoryPath,
      changedFilesJson: job.changedFiles,
      repositoryFullName: job.repositoryFullName,
      pullRequestNumber: job.pullRequestNumber,
      deliveryId: job.deliveryId,
    },
    update: {
      updatedAt: toDate(job.updatedAt),
      status: toScanJobStatus(job.status),
      repositoryPath: job.repositoryPath,
      changedFilesJson: job.changedFiles,
      repositoryFullName: job.repositoryFullName,
      pullRequestNumber: job.pullRequestNumber,
      deliveryId: job.deliveryId,
    },
  });
}

export async function readScanJobPostgres(
  jobId: string,
): Promise<PersistedScanJob> {
  const prisma = getPrismaClient();
  const result = await prisma.scanJob.findUnique({
    where: {
      id: jobId,
    },
  });

  if (!result) {
    throw new Error(`Scan job not found: ${jobId}`);
  }

  return fromDbScanJob(result);
}

export async function listPendingScanJobsPostgres(): Promise<
  PersistedScanJob[]
> {
  const prisma = getPrismaClient();
  const jobs = await prisma.scanJob.findMany({
    where: {
      status: "pending",
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return jobs.map((job) => fromDbScanJob(job));
}

export async function markScanJobStatusPostgres(
  job: PersistedScanJob,
  status: ScanJobStatus,
): Promise<PersistedScanJob> {
  const prisma = getPrismaClient();
  const updated = await prisma.scanJob.upsert({
    where: {
      id: job.id,
    },
    create: {
      id: job.id,
      createdAt: toDate(job.createdAt),
      updatedAt: new Date(),
      status: toScanJobStatus(status),
      repositoryPath: job.repositoryPath,
      changedFilesJson: job.changedFiles,
      repositoryFullName: job.repositoryFullName,
      pullRequestNumber: job.pullRequestNumber,
      deliveryId: job.deliveryId,
    },
    update: {
      updatedAt: new Date(),
      status: toScanJobStatus(status),
      repositoryPath: job.repositoryPath,
      changedFilesJson: job.changedFiles,
      repositoryFullName: job.repositoryFullName,
      pullRequestNumber: job.pullRequestNumber,
      deliveryId: job.deliveryId,
    },
  });

  return fromDbScanJob(updated);
}

export async function persistFindingsReportPostgres(
  report: PersistedFindingsReport,
): Promise<void> {
  const prisma = getPrismaClient();

  await persistScanJobPostgres(report.job);

  await prisma.findingsReport.upsert({
    where: {
      jobId: report.job.id,
    },
    create: {
      jobId: report.job.id,
      producedAt: toDate(report.producedAt),
      summaryJson: toPrismaJson(report.summary),
      pullRequestCommentBody: report.pullRequestCommentBody,
    },
    update: {
      producedAt: toDate(report.producedAt),
      summaryJson: toPrismaJson(report.summary),
      pullRequestCommentBody: report.pullRequestCommentBody,
    },
  });
}

export async function readFindingsReportPostgres(
  jobId: string,
): Promise<PersistedFindingsReport> {
  const prisma = getPrismaClient();
  const result = await prisma.findingsReport.findUnique({
    where: {
      jobId,
    },
    include: {
      job: true,
    },
  });

  if (!result) {
    throw new Error(`Findings report not found: ${jobId}`);
  }

  return fromDbReport(result);
}

export async function listFindingsReportsPostgres(): Promise<
  PersistedFindingsReport[]
> {
  const prisma = getPrismaClient();
  const reports = await prisma.findingsReport.findMany({
    include: {
      job: true,
    },
    orderBy: {
      producedAt: "desc",
    },
  });

  return reports.map((report) => fromDbReport(report));
}
