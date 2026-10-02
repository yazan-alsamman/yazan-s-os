import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createActivityService } from "@/modules/analytics/activity.service";
import { activityQuerySchema } from "@/modules/analytics/dashboard.schemas";

export const dynamic = "force-dynamic";

/** GET /api/v1/analytics/activity — the caller's recent activity (from their audit log), paginated. */
export const GET = defineUserRoute(
  "v1.analytics.activity",
  async ({ request, ctx }) =>
    createActivityService(getDb()).list(ctx, parseQuery(request, activityQuerySchema)),
  { rateLimit: RateLimits.analytics },
);
