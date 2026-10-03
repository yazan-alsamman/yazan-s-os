import { getDb } from "@/lib/db/client";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createGoalsAnalyticsService } from "@/modules/analytics/goals-analytics.service";

export const dynamic = "force-dynamic";

/** GET /api/v1/analytics/goals — goal analytics (status, risk, attainment, completion, load). */
export const GET = defineUserRoute(
  "v1.analytics.goals",
  async ({ ctx }) => ({ data: await createGoalsAnalyticsService(getDb()).summary(ctx) }),
  { rateLimit: RateLimits.analytics },
);
