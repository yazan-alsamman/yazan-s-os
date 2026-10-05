import { getDb } from "@/lib/db/client";
import { parseId } from "@/lib/http/params";
import { noContent } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { createIntelligenceService } from "@/modules/intelligence/intelligence.service";

export const dynamic = "force-dynamic";

/** POST — reject a candidate (records the decision so it is not re-suggested). */
export const POST = defineUserRoute<{ id: string }>(
  "v1.intelligence.candidates.reject",
  async ({ params, ctx }) => {
    await createIntelligenceService(getDb()).rejectCandidate(ctx, parseId(params.id));
    return noContent();
  },
);
