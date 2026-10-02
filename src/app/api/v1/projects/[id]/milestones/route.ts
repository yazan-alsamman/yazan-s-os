import { getDb } from "@/lib/db/client";
import { parseBody, parseId, parseQuery } from "@/lib/http/params";
import { created } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import {
  createMilestoneSchema,
  listProjectMilestonesQuerySchema,
} from "@/modules/milestones/milestone.schemas";
import { createMilestoneService } from "@/modules/milestones/milestone.service";

export const dynamic = "force-dynamic";

type Params = { id: string };

/** GET /api/v1/projects/:id/milestones — the project's milestones (404 for foreign projects). */
export const GET = defineUserRoute<Params>(
  "v1.projects.milestones.list",
  async ({ request, params, ctx }) =>
    createMilestoneService(getDb()).listForProject(
      ctx,
      parseId(params.id),
      parseQuery(request, listProjectMilestonesQuerySchema),
    ),
  { rateLimit: RateLimits.analytics },
);

/** POST /api/v1/projects/:id/milestones — create a milestone under one of the caller's projects. */
export const POST = defineUserRoute<Params>(
  "v1.projects.milestones.create",
  async ({ request, params, ctx }) => {
    const projectId = parseId(params.id);
    const input = await parseBody(request, createMilestoneSchema);
    return created(await createMilestoneService(getDb()).create(ctx, projectId, input));
  },
);
