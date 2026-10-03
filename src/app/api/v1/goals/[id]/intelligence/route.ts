import { getDb } from "@/lib/db/client";
import { parseId } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createGoalIntelligenceService } from "@/modules/goals/goal-intelligence";

export const dynamic = "force-dynamic";

/** GET /api/v1/goals/:id/intelligence — the goal dossier's analysis (404 for foreign goals). */
export const GET = defineUserRoute<{ id: string }>(
  "v1.goals.intelligence",
  async ({ params, ctx }) => ({
    data: await createGoalIntelligenceService(getDb()).get(ctx, parseId(params.id)),
  }),
  { rateLimit: RateLimits.analytics },
);
