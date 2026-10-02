import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import {
  createPortfolioService,
  portfolioFiltersSchema,
} from "@/modules/analytics/portfolio.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/analytics/portfolio — project portfolio analytics for the session user
 * (range, from, to). No identifier is accepted; identity comes from the session.
 */
export const GET = defineUserRoute(
  "v1.analytics.portfolio",
  async ({ request, ctx }) => ({
    data: await createPortfolioService(getDb()).portfolio(
      ctx,
      parseQuery(request, portfolioFiltersSchema),
    ),
  }),
  { rateLimit: RateLimits.analytics },
);
