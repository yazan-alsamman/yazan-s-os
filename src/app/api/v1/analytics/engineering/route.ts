import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import {
  createEngineeringAnalyticsService,
  engineeringFiltersSchema,
} from "@/modules/analytics/engineering-analytics.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/analytics/engineering — cross-domain engineering activity analytics for the session
 * user (range, from, to). No identifier is accepted; identity comes from the session.
 */
export const GET = defineUserRoute(
  "v1.analytics.engineering",
  async ({ request, ctx }) => ({
    data: await createEngineeringAnalyticsService(getDb()).engineering(
      ctx,
      parseQuery(request, engineeringFiltersSchema),
    ),
  }),
  { rateLimit: RateLimits.analytics },
);
