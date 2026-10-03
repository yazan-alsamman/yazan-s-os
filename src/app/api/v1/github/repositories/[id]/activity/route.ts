import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { parseExternalId } from "@/modules/integrations/external-id";
import { createGitHubService } from "@/modules/integrations/github/github.service";
import { listActivityQuerySchema } from "@/modules/integrations/integration.schemas";

export const dynamic = "force-dynamic";
interface P {
  id: string;
}

/** GET /api/v1/github/repositories/:id/activity — repository activity timeline (paginated). */
export const GET = defineUserRoute<P>(
  "v1.github.activity",
  async ({ request, params, ctx }) => ({
    data: await createGitHubService(getDb()).listActivity(
      ctx,
      parseExternalId(params.id),
      parseQuery(request, listActivityQuerySchema),
    ),
  }),
  { rateLimit: RateLimits.integration },
);
