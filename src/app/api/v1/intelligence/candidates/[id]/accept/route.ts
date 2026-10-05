import { getDb } from "@/lib/db/client";
import { parseBody, parseId } from "@/lib/http/params";
import { created } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { acceptCandidateSchema } from "@/modules/intelligence/intelligence.schemas";
import { createIntelligenceService } from "@/modules/intelligence/intelligence.service";

export const dynamic = "force-dynamic";

/** POST — accept a candidate → create authoritative (unverified) Evidence. */
export const POST = defineUserRoute<{ id: string }>(
  "v1.intelligence.candidates.accept",
  async ({ request, params, ctx }) =>
    created(
      await createIntelligenceService(getDb()).acceptCandidate(
        ctx,
        parseId(params.id),
        await parseBody(request, acceptCandidateSchema),
      ),
    ),
);
