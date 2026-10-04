import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createGitHubInsightsService } from "@/modules/integrations/github/github-insights.service";
import { githubRangeQuerySchema } from "@/modules/integrations/integration.schemas";
export const dynamic = "force-dynamic";
/** GET the connected account own GitHub activity. */
export const GET = defineUserRoute(
  "v1.github.personal",
  async ({ request, ctx }) => ({
    data: await createGitHubInsightsService(getDb()).personalActivity(
      ctx,
      parseQuery(request, githubRangeQuerySchema),
    ),
  }),
  { rateLimit: RateLimits.integration },
);
