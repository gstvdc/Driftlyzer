import path from "node:path";

import { scanRepository } from "@drift/core";
import {
  buildDriftlyzerPullRequestComment,
  getPersistenceMode,
  listPendingScanJobs,
  markScanJobStatus,
  parseRepositoryFullName,
  persistFindingsReport,
  postPullRequestComment,
  postPullRequestCommentWithGitHubApp,
  readScanJob,
  startScanQueueWorker,
  type PersistedScanJob,
  type ScanQueueMode,
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

type WorkerRunOptions = {
  storageRoot?: string;
  semanticReviewEnabled?: boolean;
  publishComment?: boolean;
  githubToken?: string;
  githubAppId?: string;
  githubAppPrivateKey?: string;
  githubApiBaseUrl?: string;
};

export type QueueWorkerConsumer = {
  mode: ScanQueueMode;
  queueName: string;
  redisUrl?: string;
  stop: () => Promise<void>;
};

export async function runScanJob(
  job: PersistedScanJob,
  options: WorkerRunOptions = {},
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
    job.repositoryFullName &&
    typeof job.pullRequestNumber === "number"
  ) {
    const githubToken =
      options.githubToken ?? process.env.DRIFTLYZER_GITHUB_TOKEN?.trim();
    const targetRepo = parseRepositoryFullName(job.repositoryFullName);
    const commentTarget = {
      owner: targetRepo.owner,
      repo: targetRepo.repo,
      pullNumber: job.pullRequestNumber,
    };

    if (githubToken) {
      await postPullRequestComment({
        token: githubToken,
        target: commentTarget,
        body: commentBody,
        apiBaseUrl: options.githubApiBaseUrl,
      });

      pullRequestCommentPublished = true;
    } else {
      const githubAppAuth = resolveGitHubAppAuth(options);

      if (githubAppAuth && typeof job.installationId === "number") {
        await postPullRequestCommentWithGitHubApp({
          auth: {
            appId: githubAppAuth.appId,
            privateKey: githubAppAuth.privateKey,
            installationId: job.installationId,
            apiBaseUrl: options.githubApiBaseUrl,
          },
          target: commentTarget,
          body: commentBody,
        });

        pullRequestCommentPublished = true;
      }
    }
  }

  return {
    jobId: job.id,
    scannedPath: summary.rootPath,
    findings: summary.totalFindings,
    relations: summary.totalRelations,
    persistedReport:
      getPersistenceMode() === "postgres"
        ? `postgres:findings_reports/${job.id}`
        : path.join(storageRoot, "findings", `${job.id}.json`),
    pullRequestCommentPublished,
  };
}

export async function processScanJobById(
  jobId: string,
  options: WorkerRunOptions = {},
): Promise<WorkerJobResult> {
  const storageRoot = options.storageRoot ?? DEFAULT_STORAGE_ROOT;
  const job = await readScanJob(storageRoot, jobId);

  return processPersistedScanJob(job, {
    storageRoot,
    semanticReviewEnabled: options.semanticReviewEnabled,
    publishComment: options.publishComment,
    githubToken: options.githubToken,
    githubApiBaseUrl: options.githubApiBaseUrl,
  });
}

export async function startQueuedScanJobConsumer(
  options: WorkerRunOptions & {
    concurrency?: number;
  } = {},
): Promise<QueueWorkerConsumer> {
  const storageRoot = options.storageRoot ?? DEFAULT_STORAGE_ROOT;
  const semanticReviewEnabled = options.semanticReviewEnabled ?? false;
  const publishComment = options.publishComment ?? false;

  const worker = await startScanQueueWorker({
    concurrency: options.concurrency,
    handler: async (payload) => {
      await processScanJobById(payload.jobId, {
        storageRoot,
        semanticReviewEnabled,
        publishComment,
        githubToken: options.githubToken,
        githubApiBaseUrl: options.githubApiBaseUrl,
      });
    },
  });

  return {
    mode: worker.mode,
    queueName: worker.queueName,
    redisUrl: worker.redisUrl,
    stop: worker.stop,
  };
}

export async function processNextPendingScanJob(
  input: string | WorkerRunOptions = DEFAULT_STORAGE_ROOT,
): Promise<WorkerJobResult | null> {
  const options =
    typeof input === "string"
      ? {
          storageRoot: input,
        }
      : input;
  const storageRoot = options.storageRoot ?? DEFAULT_STORAGE_ROOT;
  const pendingJobs = await listPendingScanJobs(storageRoot);
  const nextJob = pendingJobs.sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  )[0];

  if (!nextJob) {
    return null;
  }

  return processPersistedScanJob(nextJob, {
    storageRoot,
    semanticReviewEnabled: options.semanticReviewEnabled,
    publishComment: options.publishComment,
    githubToken: options.githubToken,
    githubAppId: options.githubAppId,
    githubAppPrivateKey: options.githubAppPrivateKey,
    githubApiBaseUrl: options.githubApiBaseUrl,
  });
}

async function processPersistedScanJob(
  job: PersistedScanJob,
  options: WorkerRunOptions,
): Promise<WorkerJobResult> {
  const storageRoot = options.storageRoot ?? DEFAULT_STORAGE_ROOT;
  const processingJob =
    job.status === "processing"
      ? job
      : await markScanJobStatus(storageRoot, job, "processing");

  try {
    const result = await runScanJob(processingJob, {
      storageRoot,
      semanticReviewEnabled: options.semanticReviewEnabled,
      publishComment: options.publishComment,
      githubToken: options.githubToken,
      githubApiBaseUrl: options.githubApiBaseUrl,
    });

    await markScanJobStatus(storageRoot, processingJob, "completed");
    return result;
  } catch (error) {
    await markScanJobStatus(storageRoot, processingJob, "failed");
    throw error;
  }
}

function resolveGitHubAppAuth(
  options: WorkerRunOptions,
): { appId: string; privateKey: string } | null {
  const appId =
    options.githubAppId ?? process.env.DRIFTLYZER_GITHUB_APP_ID?.trim();
  const privateKey =
    options.githubAppPrivateKey ??
    process.env.DRIFTLYZER_GITHUB_APP_PRIVATE_KEY;

  if (!appId || !privateKey?.trim()) {
    return null;
  }

  return {
    appId,
    privateKey,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2] ?? "run-pending";
  const publishComment = readBooleanEnv(
    process.env.DRIFTLYZER_PUBLISH_PR_COMMENT,
  );
  const githubToken = process.env.DRIFTLYZER_GITHUB_TOKEN?.trim();
  const githubAppId = process.env.DRIFTLYZER_GITHUB_APP_ID?.trim();
  const githubAppPrivateKey =
    process.env.DRIFTLYZER_GITHUB_APP_PRIVATE_KEY?.trim();
  const githubApiBaseUrl = process.env.DRIFTLYZER_GITHUB_API_BASE_URL?.trim();

  if (command === "listen-queue") {
    const workerConcurrency = Number(
      process.env.DRIFTLYZER_WORKER_CONCURRENCY ?? "2",
    );

    startQueuedScanJobConsumer({
      storageRoot: DEFAULT_STORAGE_ROOT,
      semanticReviewEnabled: false,
      publishComment,
      githubToken,
      githubAppId,
      githubAppPrivateKey,
      githubApiBaseUrl,
      concurrency: Number.isNaN(workerConcurrency) ? 2 : workerConcurrency,
    })
      .then((consumer) => {
        if (consumer.mode === "polling") {
          console.log(
            JSON.stringify(
              {
                service: "worker",
                mode: consumer.mode,
                queueName: consumer.queueName,
                message:
                  "Queue mode is polling. Set DRIFTLYZER_QUEUE_MODE=bullmq and REDIS_URL to consume jobs with Redis.",
              },
              null,
              2,
            ),
          );
          return;
        }

        console.log(
          JSON.stringify(
            {
              service: "worker",
              mode: consumer.mode,
              queueName: consumer.queueName,
              redisUrl: consumer.redisUrl,
              status: "listening",
            },
            null,
            2,
          ),
        );

        const shutdown = async () => {
          await consumer.stop();
          process.exit(0);
        };

        process.once("SIGINT", () => {
          void shutdown();
        });
        process.once("SIGTERM", () => {
          void shutdown();
        });
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.error(`@drift/worker failed: ${message}`);
        process.exitCode = 1;
      });
  } else if (command === "run-job") {
    const jobId = process.argv[3];

    if (!jobId) {
      throw new Error("Missing job ID for run-job");
    }

    processScanJobById(jobId, {
      storageRoot: DEFAULT_STORAGE_ROOT,
      semanticReviewEnabled: false,
      publishComment,
      githubToken,
      githubAppId,
      githubAppPrivateKey,
      githubApiBaseUrl,
    })
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
    processNextPendingScanJob({
      storageRoot: DEFAULT_STORAGE_ROOT,
      semanticReviewEnabled: false,
      publishComment,
      githubToken,
      githubAppId,
      githubAppPrivateKey,
      githubApiBaseUrl,
    })
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

function readBooleanEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
