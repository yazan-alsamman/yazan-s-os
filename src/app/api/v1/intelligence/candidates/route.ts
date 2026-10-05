import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { listCandidatesQuerySchema } from "@/modules/intelligence/intelligence.schemas";
import { createIntelligenceService } from "@/modules/intelligence/intelligence.service";

export const dynamic = "force-dynamic";

/** GET — list automatically extracted evidence candidates for review. */
export const GET = defineUserRoute("v1.intelligence.candidates.list", async ({ request, ctx }) =>
  createIntelligenceService(getDb()).listCandidates(
    ctx,
    parseQuery(request, listCandidatesQuerySchema),
  ),
);
