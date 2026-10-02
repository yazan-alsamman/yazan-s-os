import "server-only";

import { Redis } from "ioredis";

import { getServerEnv } from "@/lib/config/env";

export function createRedisConnection(url: string): Redis {
  // BullMQ requires maxRetriesPerRequest = null on connections used by workers.
  return new Redis(url, { maxRetriesPerRequest: null });
}

const globalForRedis = globalThis as unknown as { peosRedis?: Redis };

/** Shared Redis connection for queues and infrastructure checks. */
export function getRedis(): Redis {
  globalForRedis.peosRedis ??= createRedisConnection(getServerEnv().REDIS_URL);
  return globalForRedis.peosRedis;
}
