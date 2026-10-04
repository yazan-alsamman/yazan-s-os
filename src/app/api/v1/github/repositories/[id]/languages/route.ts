import { getDb } from "@/lib/db/client";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { parseExternalId } from "@/modules/integrations/external-id";
import { createGitHubAnalyticsService } from "@/modules/integrations/github/github-analytics.service";
export const dynamic = "force-dynamic";
interface P {
  id: string;
}
/** GET /api/v1/github/repositories/:id/languages — GitHub-reported byte-level language composition. */
export const GET = defineUserRoute<P>(
  "v1.github.languages",
  async ({ params, ctx }) => ({
    data: await createGitHubAnalyticsService(getDb()).languages(ctx, parseExternalId(params.id)),
  }),
  { rateLimit: RateLimits.integration },
);
