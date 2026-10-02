import { getDb } from "@/lib/db/client";
import { paginationQuerySchema } from "@/lib/http/pagination";
import { parseId, parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createActivityService } from "@/modules/analytics/activity.service";

export const dynamic = "force-dynamic";

/** GET /api/v1/projects/:id/activity — safe activity DTOs for the project and its milestones. */
export const GET = defineUserRoute<{ id: string }>(
  "v1.projects.activity",
  async ({ request, params, ctx }) =>
    createActivityService(getDb()).listForProject(
      ctx,
      parseId(params.id),
      parseQuery(request, paginationQuerySchema),
    ),
  { rateLimit: RateLimits.analytics },
);
