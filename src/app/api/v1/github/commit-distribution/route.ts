import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createGitHubInsightsService } from "@/modules/integrations/github/github-insights.service";
import { githubRangeQuerySchema } from "@/modules/integrations/integration.schemas";
export const dynamic = "force-dynamic";
/** GET commit distributions (day-of-week, hour, author) and heatmap. */
export const GET = defineUserRoute(
  "v1.github.commit_distribution",
  async ({ request, ctx }) => ({
    data: await createGitHubInsightsService(getDb()).commitDistribution(
      ctx,
      parseQuery(request, githubRangeQuerySchema),
    ),
  }),
  { rateLimit: RateLimits.integration },
);
