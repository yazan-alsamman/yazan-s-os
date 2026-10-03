import { getDb } from "@/lib/db/client";
import { relationRoute } from "@/lib/http/crud-routes";
import { goalProjectsSchema } from "@/modules/goals/goal.schemas";
import { createGoalService } from "@/modules/goals/goal.service";

export const dynamic = "force-dynamic";

/** PUT /api/v1/goals/:id/projects — replace the goal's projects (owner-checked, audited). */
export const { PUT } = relationRoute("goals.projects", goalProjectsSchema, (ctx, id, body) =>
  createGoalService(getDb()).replaceProjects(ctx, id, body.projectIds),
);
