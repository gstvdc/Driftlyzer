import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import path from "node:path";

import { scanRepository } from "@drift/core";
import {
  createScanJob,
  listFindingsReports,
  persistScanJob,
  readFindingsReport,
  type PersistedFindingsReport,
  type GitHubPullRequestWebhookPayload,
  type PersistedScanJob,
} from "@drift/integrations";

const DEFAULT_STORAGE_ROOT = ".driftlyzer";
const ACCEPTED_PULL_REQUEST_ACTIONS = new Set([
  "opened",
  "reopened",
  "synchronize",
]);

type DriftlyzerWebhookMetadata = {
  repository_path?: string;
  changed_files?: string[];
};

type ApiWebhookPayload = GitHubPullRequestWebhookPayload & {
  driftlyzer?: DriftlyzerWebhookMetadata;
};

export type GitHubWebhookEnvelope = {
  event: string;
  deliveryId: string;
  payload: ApiWebhookPayload;
  repositoryPath: string;
  changedFiles: string[];
};

export type EnqueuedGitHubJob = {
  accepted: boolean;
  reason?: string;
  job?: PersistedScanJob;
  storageRoot: string;
};

export type ApiBootstrapSummary = {
  service: "api";
  ready: true;
  capability: "repository-scan" | "github-webhook";
  scannedPath?: string;
  findings?: number;
  graphEdges?: number;
};

export type FindingsReportFeedItem = {
  jobId: string;
  producedAt: string;
  repositoryPath: string;
  repositoryFullName?: string;
  pullRequestNumber?: number;
  findings: number;
  publishableFindings: number;
  analysisMode: "full" | "diff";
  findingSchemaVersion: string;
  status: PersistedScanJob["status"];
};

export async function bootstrapApi(
  repositoryPath: string,
): Promise<ApiBootstrapSummary> {
  const resolvedPath = path.resolve(repositoryPath);
  const scanSummary = await scanRepository(resolvedPath);

  return {
    service: "api",
    ready: true,
    capability: "repository-scan",
    scannedPath: scanSummary.rootPath,
    findings: scanSummary.totalFindings,
    graphEdges: scanSummary.graph.edges.length,
  };
}

export async function handleGithubPullRequestWebhook(
  envelope: GitHubWebhookEnvelope,
  storageRoot = DEFAULT_STORAGE_ROOT,
): Promise<EnqueuedGitHubJob> {
  if (envelope.event !== "pull_request") {
    return {
      accepted: false,
      reason: `Evento nao suportado: ${envelope.event}`,
      storageRoot,
    };
  }

  if (!ACCEPTED_PULL_REQUEST_ACTIONS.has(envelope.payload.action)) {
    return {
      accepted: false,
      reason: `Acao de pull_request ignorada: ${envelope.payload.action}`,
      storageRoot,
    };
  }

  const job = createScanJob({
    repositoryPath: path.resolve(envelope.repositoryPath),
    changedFiles: normalizeChangedFiles(envelope.changedFiles),
    repositoryFullName: envelope.payload.repository.full_name,
    pullRequestNumber: envelope.payload.pull_request.number,
    deliveryId: envelope.deliveryId,
  });

  await persistScanJob(storageRoot, job);

  return {
    accepted: true,
    storageRoot,
    job,
  };
}

export async function listFindingsReportsFeed(
  storageRoot = DEFAULT_STORAGE_ROOT,
): Promise<FindingsReportFeedItem[]> {
  const reports = await listFindingsReports(storageRoot);

  return reports.map((report) => ({
    jobId: report.job.id,
    producedAt: report.producedAt,
    repositoryPath: report.job.repositoryPath,
    repositoryFullName: report.job.repositoryFullName,
    pullRequestNumber: report.job.pullRequestNumber,
    findings: report.summary.totalFindings,
    publishableFindings: report.summary.findings.filter(
      (finding) => finding.publishable,
    ).length,
    analysisMode: report.summary.analysisScope.mode,
    findingSchemaVersion: report.summary.findingSchemaVersion,
    status: report.job.status,
  }));
}

export async function readFindingsReportByJobId(
  jobId: string,
  storageRoot = DEFAULT_STORAGE_ROOT,
): Promise<PersistedFindingsReport> {
  return readFindingsReport(storageRoot, jobId);
}

export function startApiServer(
  input: {
    port?: number;
    storageRoot?: string;
    defaultRepositoryPath?: string;
  } = {},
): void {
  const port = input.port ?? Number(process.env.PORT ?? 8787);
  const storageRoot = input.storageRoot ?? DEFAULT_STORAGE_ROOT;
  const defaultRepositoryPath = input.defaultRepositoryPath ?? process.cwd();

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? "127.0.0.1"}`,
    );

    if (request.method === "OPTIONS") {
      respondJson(response, 204, {});
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/health") {
      respondJson(response, 200, {
        service: "api",
        status: "ok",
      });
      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/findings/reports"
    ) {
      try {
        const feed = await listFindingsReportsFeed(storageRoot);
        respondJson(response, 200, {
          totalReports: feed.length,
          reports: feed,
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        respondJson(response, 500, {
          error: message,
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname.startsWith("/findings/reports/")
    ) {
      const jobId = decodeURIComponent(
        requestUrl.pathname.replace("/findings/reports/", ""),
      ).trim();

      if (!jobId) {
        respondJson(response, 400, {
          error: "Missing report job id",
        });
        return;
      }

      try {
        const report = await readFindingsReportByJobId(jobId, storageRoot);
        respondJson(response, 200, report);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";

        if (
          message.includes("ENOENT") ||
          message.includes("Findings report not found")
        ) {
          respondJson(response, 404, {
            error: `Report not found for job ${jobId}`,
          });
          return;
        }

        respondJson(response, 500, {
          error: message,
        });
      }

      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/webhooks/github"
    ) {
      try {
        const payload = (await readJsonBody(request)) as ApiWebhookPayload;
        const event = request.headers["x-github-event"];
        const delivery = request.headers["x-github-delivery"];
        const repositoryPath =
          payload.driftlyzer?.repository_path ?? defaultRepositoryPath;
        const changedFiles = payload.driftlyzer?.changed_files ?? [];
        const result = await handleGithubPullRequestWebhook(
          {
            event: typeof event === "string" ? event : "pull_request",
            deliveryId:
              typeof delivery === "string"
                ? delivery
                : `delivery-${Date.now()}`,
            payload,
            repositoryPath,
            changedFiles,
          },
          storageRoot,
        );

        respondJson(response, result.accepted ? 202 : 200, result);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        respondJson(response, 400, {
          accepted: false,
          reason: message,
        });
      }

      return;
    }

    respondJson(response, 404, {
      error: "Not found",
    });
  });

  server.listen(port, () => {
    console.log(
      `Driftlyzer API listening on http://127.0.0.1:${port} (storage: ${storageRoot})`,
    );
  });
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");

  if (!rawBody.trim()) {
    return {};
  }

  return JSON.parse(rawBody) as unknown;
}

function respondJson(
  response: ServerResponse<IncomingMessage>,
  statusCode: number,
  payload: unknown,
): void {
  response.statusCode = statusCode;
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload, null, 2));
}

function normalizeChangedFiles(changedFiles: string[]): string[] {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const changedFile of changedFiles) {
    const normalized = changedFile.trim().replace(/\\/g, "/");

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    values.push(normalized);
  }

  return values;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2] ?? "scan";

  if (command === "serve") {
    startApiServer();
  } else {
    const targetPath = process.argv[2] ?? process.cwd();

    bootstrapApi(targetPath)
      .then((result) => {
        console.log(JSON.stringify(result, null, 2));
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.error(`@drift/api failed: ${message}`);
        process.exitCode = 1;
      });
  }
}
