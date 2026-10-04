import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createGitHubAnalyticsService } from "@/modules/integrations/github/github-analytics.service";
import { githubReposQuerySchema } from "@/modules/integrations/integration.schemas";
export const dynamic = "force-dynamic";
/** GET /api/v1/github/repos — cached repositories with server-side filter/sort/pagination + facets. */
export const GET = defineUserRoute(
  "v1.github.repos",
  async ({ request, ctx }) => ({
    data: await createGitHubAnalyticsService(getDb()).repositories(
      ctx,
      parseQuery(request, githubReposQuerySchema),
    ),
  }),
  { rateLimit: RateLimits.integration },
);
