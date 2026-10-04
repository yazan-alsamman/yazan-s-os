import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createGitHubInsightsService } from "@/modules/integrations/github/github-insights.service";
import { githubListQuerySchema } from "@/modules/integrations/integration.schemas";
export const dynamic = "force-dynamic";
/** GET paginated pull-request drill-down. */
export const GET = defineUserRoute(
  "v1.github.pull_requests.list",
  async ({ request, ctx }) => ({
    data: await createGitHubInsightsService(getDb()).pullRequestList(
      ctx,
      parseQuery(request, githubListQuerySchema),
    ),
  }),
  { rateLimit: RateLimits.integration },
);
