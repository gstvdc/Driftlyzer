import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

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
