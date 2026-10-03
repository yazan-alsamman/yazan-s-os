import { getDb } from "@/lib/db/client";
import { parseBody, parseQuery } from "@/lib/http/params";
import { created } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createGoalIntelligenceService } from "@/modules/goals/goal-intelligence";
import { createGoalSchema, listGoalsQuerySchema } from "@/modules/goals/goal.schemas";
import { createGoalService } from "@/modules/goals/goal.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/goals — the caller's goals with server-side filters (structural + derived: overdue,
 * risk, attainment, skillGap), sort and pagination. The source list for every goal metric.
 * POST — create a goal (owner from the session).
 */
export const GET = defineUserRoute(
  "v1.goals.list",
  async ({ request, ctx }) =>
    createGoalIntelligenceService(getDb()).list(ctx, parseQuery(request, listGoalsQuerySchema)),
  { rateLimit: RateLimits.analytics },
);

export const POST = defineUserRoute("v1.goals.create", async ({ request, ctx }) =>
  created(await createGoalService(getDb()).create(ctx, await parseBody(request, createGoalSchema))),
);
