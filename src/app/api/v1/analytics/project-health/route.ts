import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import {
  createPortfolioService,
  healthListQuerySchema,
} from "@/modules/analytics/portfolio.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/analytics/project-health — computed health per project (computed=<bucket>,
 * manual=<status>, page). Source list for the computed-health distribution and the
 * manual-vs-computed comparison.
 */
export const GET = defineUserRoute(
  "v1.analytics.project_health",
  async ({ request, ctx }) =>
    createPortfolioService(getDb()).healthList(ctx, parseQuery(request, healthListQuerySchema)),
  { rateLimit: RateLimits.analytics },
);
