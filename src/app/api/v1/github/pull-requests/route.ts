import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createGitHubInsightsService } from "@/modules/integrations/github/github-insights.service";
import { githubResourceQuerySchema } from "@/modules/integrations/integration.schemas";
export const dynamic = "force-dynamic";
/** GET pull-request analytics for the period (synced data). */
export const GET = defineUserRoute(
  "v1.github.pull_requests",
  async ({ request, ctx }) => ({
    data: await createGitHubInsightsService(getDb()).pullRequests(
      ctx,
      parseQuery(request, githubResourceQuerySchema),
    ),
  }),
  { rateLimit: RateLimits.integration },
);
