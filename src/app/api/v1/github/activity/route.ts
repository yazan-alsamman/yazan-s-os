import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createGitHubInsightsService } from "@/modules/integrations/github/github-insights.service";
import { githubActivityQuerySchema } from "@/modules/integrations/integration.schemas";
export const dynamic = "force-dynamic";
/** GET unified GitHub activity timeline and trend for the period. */
export const GET = defineUserRoute(
  "v1.github.activity",
  async ({ request, ctx }) => ({
    data: await createGitHubInsightsService(getDb()).activity(
      ctx,
      parseQuery(request, githubActivityQuerySchema),
    ),
  }),
  { rateLimit: RateLimits.integration },
);
