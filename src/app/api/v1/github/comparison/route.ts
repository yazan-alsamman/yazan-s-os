import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createGitHubInsightsService } from "@/modules/integrations/github/github-insights.service";
import { githubComparisonQuerySchema } from "@/modules/integrations/integration.schemas";
export const dynamic = "force-dynamic";
/** GET transparent cross-repository comparison (no combined score). */
export const GET = defineUserRoute(
  "v1.github.comparison",
  async ({ request, ctx }) => ({
    data: await createGitHubInsightsService(getDb()).comparison(
      ctx,
      parseQuery(request, githubComparisonQuerySchema),
    ),
  }),
  { rateLimit: RateLimits.integration },
);
