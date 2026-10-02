import { afterAll, describe, expect, it } from "vitest";

import { getDb } from "@/lib/db/client";
import { runHealthChecks } from "@/lib/health/health-service";
import { infrastructureProbes } from "@/lib/health/infrastructure-probes";
import { getQueue, QueueName } from "@/lib/queue/queues";
import { getRedis } from "@/lib/redis/client";

describe("Redis, queue and health infrastructure", () => {
  afterAll(async () => {
    await getQueue(QueueName.System).obliterate({ force: true });
    await getQueue(QueueName.System).close();
    getRedis().disconnect();
    await getDb().$disconnect();
  });

  it("uses the isolated Redis logical database", () => {
    expect(getRedis().options.db).toBe(1);
  });

  it("answers PING", async () => {
    await expect(getRedis().ping()).resolves.toBe("PONG");
  });

  it("enqueues a job with the default retry policy", async () => {
    const job = await getQueue(QueueName.System).add("integration-check", { at: Date.now() });
    expect(job.id).toBeDefined();
    expect(job.opts.attempts).toBe(3);
    const counts = await getQueue(QueueName.System).getJobCounts("waiting");
    expect(counts.waiting).toBeGreaterThanOrEqual(1);
  });

  it("reports healthy infrastructure with storage not configured", async () => {
    const report = await runHealthChecks(infrastructureProbes());
    expect(report).toMatchObject({
      status: "healthy",
      checks: {
        database: "healthy",
        redis: "healthy",
        queue: "healthy",
        storage: "not_configured",
      },
    });
  });
});
