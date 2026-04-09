import path from "node:path";

import { scanRepository } from "@drift/core";
import {
  buildDriftlyzerPullRequestComment,
  listPendingScanJobs,
  markScanJobStatus,
  parseRepositoryFullName,
  persistFindingsReport,
  postPullRequestComment,
  readScanJob,
  type PersistedScanJob,
} from "@drift/integrations";

const DEFAULT_STORAGE_ROOT = ".driftlyzer";

export type WorkerJobResult = {
  jobId: string;
  scannedPath: string;
  findings: number;
  relations: number;
  persistedReport: string;
  pullRequestCommentPublished: boolean;
};

export async function runScanJob(
  job: PersistedScanJob,
  options: {
    storageRoot?: string;
    semanticReviewEnabled?: boolean;
    publishComment?: boolean;
    githubToken?: string;
    githubApiBaseUrl?: string;
  } = {},
): Promise<WorkerJobResult> {
  const storageRoot = options.storageRoot ?? DEFAULT_STORAGE_ROOT;
  const resolvedPath = path.resolve(job.repositoryPath);
  const summary = await scanRepository(resolvedPath, {
    precision:
      job.changedFiles.length > 0
        ? {
            diff: {
              changedFiles: job.changedFiles,
              impactExpansionDepth: 2,
            },
          }
        : undefined,
    semanticReview: options.semanticReviewEnabled
      ? {
          enabled: true,
        }
      : undefined,
  });
  const commentBody = buildDriftlyzerPullRequestComment(summary);

  await persistFindingsReport(storageRoot, {
    job,
    producedAt: new Date().toISOString(),
    summary,
    pullRequestCommentBody: commentBody,
  });

  let pullRequestCommentPublished = false;

  if (
    options.publishComment &&
    options.githubToken &&
    job.repositoryFullName &&
    typeof job.pullRequestNumber === "number"
  ) {
    const targetRepo = parseRepositoryFullName(job.repositoryFullName);

    await postPullRequestComment({
      token: options.githubToken,
      target: {
        owner: targetRepo.owner,
        repo: targetRepo.repo,
        pullNumber: job.pullRequestNumber,
      },
      body: commentBody,
      apiBaseUrl: options.githubApiBaseUrl,
    });

    pullRequestCommentPublished = true;
  }

  return {
    jobId: job.id,
    scannedPath: summary.rootPath,
    findings: summary.totalFindings,
    relations: summary.totalRelations,
    persistedReport: path.join(storageRoot, "findings", `${job.id}.json`),
    pullRequestCommentPublished,
  };
}

export async function processNextPendingScanJob(
  storageRoot = DEFAULT_STORAGE_ROOT,
): Promise<WorkerJobResult | null> {
  const pendingJobs = await listPendingScanJobs(storageRoot);
  const nextJob = pendingJobs.sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  )[0];

  if (!nextJob) {
    return null;
  }

  const processingJob = await markScanJobStatus(
    storageRoot,
    nextJob,
    "processing",
  );

  try {
    const result = await runScanJob(processingJob, {
      storageRoot,
      semanticReviewEnabled: false,
      publishComment: false,
    });

    await markScanJobStatus(storageRoot, processingJob, "completed");
    return result;
  } catch (error) {
    await markScanJobStatus(storageRoot, processingJob, "failed");
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2] ?? "run-pending";

  if (command === "run-job") {
    const jobId = process.argv[3];

    if (!jobId) {
      throw new Error("Missing job ID for run-job");
    }

    readScanJob(DEFAULT_STORAGE_ROOT, jobId)
      .then((job) =>
        runScanJob(job, {
          storageRoot: DEFAULT_STORAGE_ROOT,
          semanticReviewEnabled: false,
          publishComment: false,
        }),
      )
      .then((result) => {
        console.log(JSON.stringify(result, null, 2));
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.error(`@drift/worker failed: ${message}`);
        process.exitCode = 1;
      });
  } else {
    processNextPendingScanJob(DEFAULT_STORAGE_ROOT)
      .then((result) => {
        console.log(JSON.stringify({ result }, null, 2));
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.error(`@drift/worker failed: ${message}`);
        process.exitCode = 1;
      });
  }
}
