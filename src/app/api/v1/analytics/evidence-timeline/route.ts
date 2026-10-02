import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { timelineQuerySchema } from "@/modules/analytics/dashboard.schemas";
import { createTimelineService } from "@/modules/analytics/timeline.service";

export const dynamic = "force-dynamic";

/** GET /api/v1/analytics/evidence-timeline — dated evidence in the period, newest first, paginated. */
export const GET = defineUserRoute(
  "v1.analytics.evidenceTimeline",
  async ({ request, ctx }) =>
    createTimelineService(getDb()).list(ctx, parseQuery(request, timelineQuerySchema)),
  { rateLimit: RateLimits.analytics },
);
