import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { retrospectiveParamsSchema } from "@/modules/intelligence/intelligence.schemas";
import { createIntelligenceService } from "@/modules/intelligence/intelligence.service";

export const dynamic = "force-dynamic";

/** GET ?projectId= — a grounded, on-demand project retrospective (observed/inferred/recommended). */
export const GET = defineUserRoute("v1.intelligence.retrospective", async ({ request, ctx }) => ({
  data: await createIntelligenceService(getDb()).retrospective(
    ctx,
    parseQuery(request, retrospectiveParamsSchema).projectId,
  ),
}));
