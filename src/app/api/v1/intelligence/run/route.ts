import { getDb } from "@/lib/db/client";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createIntelligenceService } from "@/modules/intelligence/intelligence.service";

export const dynamic = "force-dynamic";

/** POST — run the deterministic detection pass (reconcile signals + extract evidence candidates). */
export const POST = defineUserRoute(
  "v1.intelligence.run",
  async ({ ctx }) => ({ data: await createIntelligenceService(getDb()).run(ctx) }),
  { rateLimit: RateLimits.integration },
);
