import { getDb } from "@/lib/db/client";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { parseExternalId } from "@/modules/integrations/external-id";
import { createGitHubService } from "@/modules/integrations/github/github.service";

export const dynamic = "force-dynamic";
interface P {
  id: string;
}

/** GET /api/v1/github/repositories/:id — one repository (by GitHub id) with its PEOS links. */
export const GET = defineUserRoute<P>(
  "v1.github.repository",
  async ({ params, ctx }) => ({
    data: await createGitHubService(getDb()).getRepository(ctx, parseExternalId(params.id)),
  }),
  { rateLimit: RateLimits.integration },
);
