import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { dashboardFiltersSchema } from "@/modules/analytics/dashboard.schemas";
import { createDashboardService } from "@/modules/analytics/dashboard.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/analytics/dashboard — Command Center KPIs and sections for the session user.
 * Filters: range, from, to, projectStatus, projectHealth, evidenceType, evidenceVerified,
 * evidenceOrigin, skillCategory. No identifier is accepted; identity comes from the session.
 */
export const GET = defineUserRoute(
  "v1.analytics.dashboard",
  async ({ request, ctx }) => ({
    data: await createDashboardService(getDb()).dashboard(
      ctx,
      parseQuery(request, dashboardFiltersSchema),
    ),
  }),
  { rateLimit: RateLimits.analytics },
);
