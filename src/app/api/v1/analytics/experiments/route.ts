import { getDb } from "@/lib/db/client";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createExperimentsAnalyticsService } from "@/modules/analytics/experiments-analytics.service";

export const dynamic = "force-dynamic";

/** GET /api/v1/analytics/experiments — AI Lab analytics (status, decision, reproducibility, coverage). */
export const GET = defineUserRoute(
  "v1.analytics.experiments",
  async ({ ctx }) => ({ data: await createExperimentsAnalyticsService(getDb()).summary(ctx) }),
  { rateLimit: RateLimits.analytics },
);
