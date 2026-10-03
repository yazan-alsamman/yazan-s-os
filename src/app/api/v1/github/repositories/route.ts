import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createGitHubService } from "@/modules/integrations/github/github.service";
import { listReposQuerySchema } from "@/modules/integrations/integration.schemas";

export const dynamic = "force-dynamic";

/** GET /api/v1/github/repositories — repositories for the connected GitHub account (live + cached). */
export const GET = defineUserRoute(
  "v1.github.repositories",
  async ({ request, ctx }) => ({
    data: await createGitHubService(getDb()).listRepositories(
      ctx,
      parseQuery(request, listReposQuerySchema),
    ),
  }),
  { rateLimit: RateLimits.integration },
);
