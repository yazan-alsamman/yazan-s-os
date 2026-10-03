import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import {
  careerGraphQuerySchema,
  createCareerGraphService,
} from "@/modules/analytics/career-graph.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/analytics/career-graph — bounded graph of real records and real relationships
 * (focusType + focusId, types, category, limit ≤ 150). Identity comes from the session only.
 */
export const GET = defineUserRoute(
  "v1.analytics.career_graph",
  async ({ request, ctx }) =>
    createCareerGraphService(getDb()).graph(ctx, parseQuery(request, careerGraphQuerySchema)),
  { rateLimit: RateLimits.analytics },
);
