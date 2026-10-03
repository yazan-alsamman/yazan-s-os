import { getDb } from "@/lib/db/client";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createArchitectureAnalyticsService } from "@/modules/analytics/architecture-analytics.service";

export const dynamic = "force-dynamic";

/** GET /api/v1/analytics/architecture — architecture analytics (decisions, revisit, coverage, components). */
export const GET = defineUserRoute(
  "v1.analytics.architecture",
  async ({ ctx }) => ({ data: await createArchitectureAnalyticsService(getDb()).summary(ctx) }),
  { rateLimit: RateLimits.analytics },
);
