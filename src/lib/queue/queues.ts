import "server-only";

import { Queue, Worker, type Processor } from "bullmq";

import { getRedis } from "@/lib/redis/client";

/**
 * Queue registry (ADR 0006). Every queue PEOS uses is declared here so that names stay
 * unique and discoverable. Phase 0 declares only the `system` queue used for health
 * checks; analytics, AI, ingestion and notification queues are added by later phases.
 */
export const QueueName = {
  System: "peos-system",
} as const;

export type QueueName = (typeof QueueName)[keyof typeof QueueName];

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 60 * 60 * 24, count: 1_000 },
  removeOnFail: { age: 60 * 60 * 24 * 7 },
} as const;

const globalForQueues = globalThis as unknown as { peosQueues?: Map<QueueName, Queue> };

export function getQueue(name: QueueName): Queue {
  globalForQueues.peosQueues ??= new Map();
  let queue = globalForQueues.peosQueues.get(name);
  if (!queue) {
    queue = new Queue(name, { connection: getRedis(), defaultJobOptions: DEFAULT_JOB_OPTIONS });
    globalForQueues.peosQueues.set(name, queue);
  }
  return queue;
}

/**
 * Create a worker for a registered queue. Workers run in a dedicated process (not the
 * Next.js server); none exist in Phase 0.
 */
export function createWorker<TData, TResult>(
  name: QueueName,
  processor: Processor<TData, TResult>,
  options: { concurrency?: number } = {},
): Worker<TData, TResult> {
  return new Worker<TData, TResult>(name, processor, {
    connection: getRedis().duplicate(),
    concurrency: options.concurrency ?? 1,
  });
}
