import { generateKeyPairSync } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  handleGithubPullRequestWebhook,
  listFindingsReportsFeed,
  readFindingsReportByJobId,
} from "../apps/api/src/index.js";
import { runScanJob } from "../apps/worker/src/index.js";
import {
  createScanJob,
  readScanJob,
} from "../packages/integrations/src/index.js";

const FIXTURES_DIR = path.resolve("tests/fixtures");
const ORIGINAL_PERSISTENCE_MODE = process.env.DRIFTLYZER_PERSISTENCE;

beforeAll(() => {
  process.env.DRIFTLYZER_PERSISTENCE = "filesystem";
});

afterAll(() => {
  if (typeof ORIGINAL_PERSISTENCE_MODE === "string") {
    process.env.DRIFTLYZER_PERSISTENCE = ORIGINAL_PERSISTENCE_MODE;
  } else {
    delete process.env.DRIFTLYZER_PERSISTENCE;
  }
});

describe("GitHub MVP flow", () => {
  it("accepts pull_request webhook and persists pending scan job", async () => {
    const storageRoot = await mkdtemp(
      path.join(os.tmpdir(), "driftlyzer-api-"),
    );
    const repositoryPath = path.join(FIXTURES_DIR, "mismatch-route-doc");

    const result = await handleGithubPullRequestWebhook(
      {
        event: "pull_request",
        deliveryId: "delivery-test",
        repositoryPath,
        changedFiles: ["frontend/src/app/accounts.service.ts"],
        payload: {
          action: "synchronize",
          repository: {
            full_name: "acme/drift-repo",
          },
          installation: {
            id: 4141,
          },
          pull_request: {
            number: 42,
            head: {
              sha: "head-sha",
            },
            base: {
              sha: "base-sha",
            },
          },
        },
      },
      storageRoot,
    );

    expect(result.accepted).toBe(true);
    expect(result.job).toBeDefined();

    const persistedJob = await readScanJob(storageRoot, result.job!.id);
    expect(persistedJob.status).toBe("pending");
    expect(persistedJob.pullRequestNumber).toBe(42);
    expect(persistedJob.installationId).toBe(4141);
  });

  it("runs persisted job with diff scan and writes findings report", async () => {
    const storageRoot = await mkdtemp(
      path.join(os.tmpdir(), "driftlyzer-worker-"),
    );
    const repositoryPath = path.join(FIXTURES_DIR, "shape-mismatch");
    const job = createScanJob({
      repositoryPath,
      changedFiles: ["backend/src/users/users.controller.ts"],
      repositoryFullName: "acme/drift-repo",
      pullRequestNumber: 99,
      deliveryId: "worker-test",
    });

    const result = await runScanJob(job, {
      storageRoot,
      semanticReviewEnabled: false,
      publishComment: false,
    });

    expect(result.findings).toBe(3);
    expect(result.pullRequestCommentPublished).toBe(false);

    const report = await readFindingsReportByJobId(job.id, storageRoot);

    expect(report.summary.analysisScope.mode).toBe("diff");
  });

  it("publishes pull request comment through GitHub App auth", async () => {
    const storageRoot = await mkdtemp(
      path.join(os.tmpdir(), "driftlyzer-app-auth-"),
    );
    const repositoryPath = path.join(FIXTURES_DIR, "mismatch-route-doc");
    const job = createScanJob({
      repositoryPath,
      changedFiles: ["frontend/src/app/accounts.service.ts"],
      repositoryFullName: "acme/drift-repo",
      pullRequestNumber: 321,
      deliveryId: "app-auth-test",
      installationId: 9191,
    });
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const privateKeyPem = privateKey
      .export({
        type: "pkcs1",
        format: "pem",
      })
      .toString();
    const fetchCalls: Array<{
      url: string;
      authorization?: string;
    }> = [];
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const headers = (init?.headers ?? {}) as Record<string, string>;

      fetchCalls.push({
        url,
        authorization: headers.Authorization ?? headers.authorization,
      });

      if (url.includes("/app/installations/9191/access_tokens")) {
        return new Response(JSON.stringify({ token: "installation-token" }), {
          status: 201,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }

      if (url.includes("/repos/acme/drift-repo/issues/321/comments")) {
        return new Response(JSON.stringify({ id: 1 }), {
          status: 201,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }

      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    try {
      const result = await runScanJob(job, {
        storageRoot,
        semanticReviewEnabled: false,
        publishComment: true,
        githubAppId: "12345",
        githubAppPrivateKey: privateKeyPem,
        githubApiBaseUrl: "https://api.github.com",
      });

      expect(result.pullRequestCommentPublished).toBe(true);
      expect(
        fetchCalls.some((call) => call.url.includes("access_tokens")),
      ).toBe(true);
      expect(
        fetchCalls.some((call) =>
          call.url.includes("/repos/acme/drift-repo/issues/321/comments"),
        ),
      ).toBe(true);

      const commentCall = fetchCalls.find((call) =>
        call.url.includes("/repos/acme/drift-repo/issues/321/comments"),
      );

      expect(commentCall?.authorization).toBe("Bearer installation-token");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("lists persisted reports for dashboard feed and reads report by job id", async () => {
    const storageRoot = await mkdtemp(
      path.join(os.tmpdir(), "driftlyzer-feed-"),
    );
    const repositoryPath = path.join(FIXTURES_DIR, "mismatch-route-doc");
    const job = createScanJob({
      repositoryPath,
      changedFiles: ["frontend/src/app/accounts.service.ts"],
      repositoryFullName: "acme/drift-repo",
      pullRequestNumber: 123,
      deliveryId: "feed-test",
    });

    await runScanJob(job, {
      storageRoot,
      semanticReviewEnabled: false,
      publishComment: false,
    });

    const feed = await listFindingsReportsFeed(storageRoot);
    const reportFeedItem = feed.find((item) => item.jobId === job.id);
    expect(reportFeedItem).toBeDefined();
    expect(reportFeedItem?.analysisMode).toBe("diff");

    const report = await readFindingsReportByJobId(job.id, storageRoot);
    expect(report.job.id).toBe(job.id);
    expect(report.summary.findingSchemaVersion).toBe("finding.v1");
  });
});
