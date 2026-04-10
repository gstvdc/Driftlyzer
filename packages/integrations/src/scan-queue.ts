import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";

const DEFAULT_QUEUE_NAME = "driftlyzer-scan-jobs";
const POLLING_MODE_VALUES = new Set(["polling", "local", "filesystem", "none"]);
const BULLMQ_MODE_VALUES = new Set(["bullmq", "redis"]);

export type ScanQueueMode = "polling" | "bullmq";

export type ScanQueuePayload = {
  jobId: string;
  repositoryPath: string;
  changedFiles: string[];
  repositoryFullName?: string;
  pullRequestNumber?: number;
  deliveryId?: string;
  installationId?: number;
  createdAt: string;
};

export type ScanQueueEnqueueResult = {
  mode: ScanQueueMode;
  queueName: string;
  queued: boolean;
  reason?: string;
};

export type ScanQueueWorkerHandle = {
  mode: ScanQueueMode;
  queueName: string;
  redisUrl?: string;
  stop: () => Promise<void>;
};

export function getScanQueueName(): string {
  const queueName = process.env.DRIFTLYZER_QUEUE_NAME?.trim();
  return queueName || DEFAULT_QUEUE_NAME;
}

export function getScanQueueMode(): ScanQueueMode {
  const configuredMode =
    process.env.DRIFTLYZER_QUEUE_MODE?.trim().toLowerCase();

  if (configuredMode && POLLING_MODE_VALUES.has(configuredMode)) {
    return "polling";
  }

  if (configuredMode && BULLMQ_MODE_VALUES.has(configuredMode)) {
    if (!process.env.REDIS_URL?.trim()) {
      throw new Error(
        "DRIFTLYZER_QUEUE_MODE=bullmq requires REDIS_URL to be set",
      );
    }

    return "bullmq";
  }

  if (process.env.REDIS_URL?.trim()) {
    return "bullmq";
  }

  return "polling";
}

export async function enqueueScanJob(
  payload: ScanQueuePayload,
): Promise<ScanQueueEnqueueResult> {
  const mode = getScanQueueMode();
  const queueName = getScanQueueName();

  if (mode === "polling") {
    return {
      mode,
      queueName,
      queued: false,
      reason: "Queue mode is polling; worker must consume pending jobs.",
    };
  }

  const redisUrl = requireRedisUrl();
  const connection = createRedisConnection(redisUrl);
  const queue = new Queue<ScanQueuePayload>(queueName, {
    connection,
  });

  try {
    await queue.add("scan-job", payload, {
      jobId: payload.jobId,
      removeOnComplete: 250,
      removeOnFail: 1000,
    });

    return {
      mode,
      queueName,
      queued: true,
    };
  } finally {
    await queue.close();
    await closeRedisConnection(connection);
  }
}

export async function startScanQueueWorker(input: {
  handler: (payload: ScanQueuePayload) => Promise<void>;
  concurrency?: number;
}): Promise<ScanQueueWorkerHandle> {
  const mode = getScanQueueMode();
  const queueName = getScanQueueName();

  if (mode === "polling") {
    return {
      mode,
      queueName,
      stop: async () => {},
    };
  }

  const redisUrl = requireRedisUrl();
  const connection = createRedisConnection(redisUrl);
  const worker = new Worker<ScanQueuePayload>(
    queueName,
    async (job) => {
      await input.handler(job.data);
    },
    {
      connection,
      concurrency: Math.max(1, input.concurrency ?? 2),
    },
  );

  await worker.waitUntilReady();

  return {
    mode,
    queueName,
    redisUrl,
    stop: async () => {
      await worker.close();
      await closeRedisConnection(connection);
    },
  };
}

function requireRedisUrl(): string {
  const redisUrl = process.env.REDIS_URL?.trim();

  if (!redisUrl) {
    throw new Error("REDIS_URL is required when queue mode is bullmq");
  }

  return redisUrl;
}

function createRedisConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null,
  });
}

async function closeRedisConnection(connection: Redis): Promise<void> {
  try {
    await connection.quit();
  } catch {
    connection.disconnect();
  }
}
