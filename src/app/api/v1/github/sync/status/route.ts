import { getDb } from "@/lib/db/client";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createGitHubInsightsService } from "@/modules/integrations/github/github-insights.service";
export const dynamic = "force-dynamic";
/** GET per-resource synchronization state and completeness. */
export const GET = defineUserRoute(
  "v1.github.sync.status",
  async ({ ctx }) => ({ data: await createGitHubInsightsService(getDb()).syncStatus(ctx) }),
  { rateLimit: RateLimits.integration },
);
