import { getDb } from "@/lib/db/client";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createGitHubSyncService } from "@/modules/integrations/github/github-sync.service";
export const dynamic = "force-dynamic";
/** POST /api/v1/github/sync — full repository + recent-commit synchronization (explicit). */
export const POST = defineUserRoute(
  "v1.github.sync",
  async ({ ctx }) => ({ data: await createGitHubSyncService(getDb()).sync(ctx) }),
  { rateLimit: RateLimits.integration },
);
