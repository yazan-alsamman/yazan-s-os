import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { weeklyReviewQuerySchema } from "@/modules/intelligence/intelligence.schemas";
import { createIntelligenceService } from "@/modules/intelligence/intelligence.service";

export const dynamic = "force-dynamic";

/**
 * GET — the weekly executive review for the requested (or current) ISO week. Generation is
 * deterministic and idempotent (upsert per owner+week), so reading never duplicates or corrupts.
 */
export const GET = defineUserRoute("v1.intelligence.weekly_review", async ({ request, ctx }) => ({
  data: await createIntelligenceService(getDb()).weeklyReview(
    ctx,
    parseQuery(request, weeklyReviewQuerySchema).week,
  ),
}));
