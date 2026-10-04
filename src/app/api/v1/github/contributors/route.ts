import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createGitHubInsightsService } from "@/modules/integrations/github/github-insights.service";
import { githubListQuerySchema } from "@/modules/integrations/integration.schemas";
export const dynamic = "force-dynamic";
/** GET /api/v1/github/contributors — contributor analytics (repository contributors). */
export const GET = defineUserRoute(
  "v1.github.contributors",
  async ({ request, ctx }) => ({
    data: await createGitHubInsightsService(getDb()).contributors(ctx, {
      repo: parseQuery(request, githubListQuerySchema).repo,
    }),
  }),
  { rateLimit: RateLimits.integration },
);
