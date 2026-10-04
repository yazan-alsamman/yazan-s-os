import { getDb } from "@/lib/db/client";
import { parseBody } from "@/lib/http/params";
import { created } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { githubEvidenceSchema } from "@/modules/evidence/evidence.schemas";
import { createGithubEvidenceService } from "@/modules/evidence/github-evidence.service";

export const dynamic = "force-dynamic";

/** POST — create one evidence record from a synchronized GitHub resource (controlled; never automatic). */
export const POST = defineUserRoute("v1.evidence.from_github.create", async ({ request, ctx }) => {
  const body = await parseBody(request, githubEvidenceSchema);
  return created(await createGithubEvidenceService(getDb()).create(ctx, body));
});
