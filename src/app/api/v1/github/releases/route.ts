import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createGitHubInsightsService } from "@/modules/integrations/github/github-insights.service";
import { githubResourceQuerySchema } from "@/modules/integrations/integration.schemas";
export const dynamic = "force-dynamic";
/** GET release analytics for the period. */
export const GET = defineUserRoute(
  "v1.github.releases",
  async ({ request, ctx }) => ({
    data: await createGitHubInsightsService(getDb()).releases(
      ctx,
      parseQuery(request, githubResourceQuerySchema),
    ),
  }),
  { rateLimit: RateLimits.integration },
);
