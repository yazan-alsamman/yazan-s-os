import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createGitHubAnalyticsService } from "@/modules/integrations/github/github-analytics.service";
import { githubRangeQuerySchema } from "@/modules/integrations/integration.schemas";
export const dynamic = "force-dynamic";
/** GET /api/v1/github/overview — repository + commit KPIs for the period (from synced data). */
export const GET = defineUserRoute(
  "v1.github.overview",
  async ({ request, ctx }) => ({
    data: await createGitHubAnalyticsService(getDb()).overview(
      ctx,
      parseQuery(request, githubRangeQuerySchema),
    ),
  }),
  { rateLimit: RateLimits.integration },
);
