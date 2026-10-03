import "server-only";

import { AppError } from "@/lib/errors/app-error";
import { logger } from "@/lib/observability/logger";
import { getRedis } from "@/lib/redis/client";

export interface RateLimitPolicy {
  /** Logical bucket name, e.g. "mutation" or "import". */
  name: string;
  limit: number;
  windowSeconds: number;
}

/** Policies for application endpoints (ADR 0015). Auth endpoints are limited by Better Auth. */
export const RateLimits = {
  mutation: { name: "mutation", limit: 120, windowSeconds: 60 },
  import: { name: "import", limit: 20, windowSeconds: 3600 },
  export: { name: "export", limit: 30, windowSeconds: 3600 },
  /** Command Center reads run ~35 aggregate queries each. */
  analytics: { name: "analytics", limit: 120, windowSeconds: 60 },
  /** AI Copilot questions (06 "rate-limit expensive operations"; ADR 0050): each may call a model. */
  copilot: { name: "copilot", limit: 30, windowSeconds: 600 },
} as const satisfies Record<string, RateLimitPolicy>;

/**
 * Fixed-window limiter in Redis, keyed per user and policy. If Redis is unreachable the request
 * is allowed (fail-open) and a warning is logged: availability of a single-owner tool is
 * preferred over strict limiting when the limiter itself is down.
 */
export async function enforceRateLimit(userId: string, policy: RateLimitPolicy): Promise<void> {
  const window = Math.floor(Date.now() / 1000 / policy.windowSeconds);
  const key = `peos:ratelimit:${policy.name}:${userId}:${window}`;
  let count: number;
  try {
    const redis = getRedis();
    count = await Promise.race([
      redis
        .multi()
        .incr(key)
        .expire(key, policy.windowSeconds)
        .exec()
        .then((results) => Number(results?.[0]?.[1] ?? 0)),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 500)),
    ]);
  } catch (error) {
    logger.warn({ err: error, policy: policy.name }, "rate_limit.unavailable");
    return;
  }
  if (count > policy.limit) {
    throw new AppError("RATE_LIMITED");
  }
}
