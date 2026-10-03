import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { roadmapQuerySchema } from "@/modules/goals/goal.schemas";
import { createRoadmapService } from "@/modules/goals/roadmap.service";

export const dynamic = "force-dynamic";

/** GET /api/v1/goals/roadmap — timeline (from, to ≤ 5 years), quarters, undated goals, tree, dependencies. */
export const GET = defineUserRoute(
  "v1.goals.roadmap",
  async ({ request, ctx }) => ({
    data: await createRoadmapService(getDb()).roadmap(ctx, parseQuery(request, roadmapQuerySchema)),
  }),
  { rateLimit: RateLimits.analytics },
);
