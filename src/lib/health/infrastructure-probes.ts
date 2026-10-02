import "server-only";

import { getDb } from "@/lib/db/client";
import { getQueue, QueueName } from "@/lib/queue/queues";
import { getRedis } from "@/lib/redis/client";
import { getStorage } from "@/lib/storage/s3-storage";

import type { HealthProbe } from "./health-service";

/** The concrete probes for PEOS infrastructure. The database is the only critical one. */
export function infrastructureProbes(): HealthProbe[] {
  const storage = getStorage();
  return [
    {
      name: "database",
      critical: true,
      check: async () => {
        await getDb().$queryRaw`SELECT 1`;
      },
    },
    {
      name: "redis",
      critical: false,
      check: async () => {
        await getRedis().ping();
      },
    },
    {
      name: "queue",
      critical: false,
      check: async () => {
        await getQueue(QueueName.System).getJobCounts("waiting", "failed");
      },
    },
    {
      name: "storage",
      critical: false,
      check: storage ? () => storage.ping() : null,
    },
  ];
}
