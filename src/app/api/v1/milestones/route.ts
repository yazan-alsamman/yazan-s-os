import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { listMilestonesQuerySchema } from "@/modules/milestones/milestone.schemas";
import { createMilestoneService } from "@/modules/milestones/milestone.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/milestones — the caller's milestones across projects (filters: projectId, status,
 * open, overdue, dated, dueFrom/To, completedFrom/To, q). Drill-down source for milestone metrics.
 * Milestones are created under a project: POST /api/v1/projects/:id/milestones.
 */
export const GET = defineUserRoute(
  "v1.milestones.list",
  async ({ request, ctx }) =>
    createMilestoneService(getDb()).list(ctx, parseQuery(request, listMilestonesQuerySchema)),
  { rateLimit: RateLimits.analytics },
);
