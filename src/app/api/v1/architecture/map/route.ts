import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createArchitectureIntelligenceService } from "@/modules/architecture/architecture-intelligence";
import { mapQuerySchema } from "@/modules/architecture/architecture.schemas";

export const dynamic = "force-dynamic";

/** GET — the bounded architecture map (persisted components and dependencies only; ADR 0043). */
export const GET = defineUserRoute(
  "v1.architecture.map",
  async ({ request, ctx }) => ({
    data: await createArchitectureIntelligenceService(getDb()).map(
      ctx,
      parseQuery(request, mapQuerySchema),
    ),
  }),
  { rateLimit: RateLimits.analytics },
);
