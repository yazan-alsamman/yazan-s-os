import { getDb } from "@/lib/db/client";
import { parseBody } from "@/lib/http/params";
import { created, noContent } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { parseExternalId } from "@/modules/integrations/external-id";
import { createGitHubService } from "@/modules/integrations/github/github.service";
import { linkProjectSchema } from "@/modules/integrations/integration.schemas";

export const dynamic = "force-dynamic";
interface P {
  id: string;
}

/** POST — explicitly link this repository to a PEOS project. */
export const POST = defineUserRoute<P>(
  "v1.github.link",
  async ({ request, params, ctx }) => {
    const body = await parseBody(request, linkProjectSchema);
    return created(
      await createGitHubService(getDb()).linkProject(
        ctx,
        parseExternalId(params.id),
        body.projectId,
      ),
    );
  },
  { rateLimit: RateLimits.mutation },
);

/** DELETE — remove a repository↔project link. */
export const DELETE = defineUserRoute<P>(
  "v1.github.unlink",
  async ({ request, params, ctx }) => {
    const body = await parseBody(request, linkProjectSchema);
    await createGitHubService(getDb()).unlinkProject(
      ctx,
      parseExternalId(params.id),
      body.projectId,
    );
    return noContent();
  },
  { rateLimit: RateLimits.mutation },
);
