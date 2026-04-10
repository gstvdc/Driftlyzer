import { afterEach, describe, expect, it } from "vitest";

import {
  enqueueScanJob,
  getScanQueueMode,
} from "../packages/integrations/src/index.js";

const ORIGINAL_ENV: Record<string, string | undefined> = {
  ...process.env,
};

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (typeof value === "string") {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
}

afterEach(() => {
  restoreEnv();
});

describe("scan queue config", () => {
  it("uses polling mode by default", () => {
    delete process.env.DRIFTLYZER_QUEUE_MODE;
    delete process.env.REDIS_URL;

    expect(getScanQueueMode()).toBe("polling");
  });

  it("requires REDIS_URL when bullmq mode is explicit", () => {
    process.env.DRIFTLYZER_QUEUE_MODE = "bullmq";
    delete process.env.REDIS_URL;

    expect(() => getScanQueueMode()).toThrow(
      "DRIFTLYZER_QUEUE_MODE=bullmq requires REDIS_URL to be set",
    );
  });

  it("auto switches to bullmq mode when REDIS_URL is present", () => {
    delete process.env.DRIFTLYZER_QUEUE_MODE;
    process.env.REDIS_URL = "redis://127.0.0.1:6379";

    expect(getScanQueueMode()).toBe("bullmq");
  });

  it("does not enqueue when mode is polling", async () => {
    delete process.env.DRIFTLYZER_QUEUE_MODE;
    delete process.env.REDIS_URL;

    const result = await enqueueScanJob({
      jobId: "job-test",
      repositoryPath: "/tmp/repo",
      changedFiles: ["frontend/src/app/users.service.ts"],
      repositoryFullName: "acme/repo",
      pullRequestNumber: 12,
      deliveryId: "delivery-1",
      createdAt: new Date().toISOString(),
    });

    expect(result.mode).toBe("polling");
    expect(result.queued).toBe(false);
  });
});
