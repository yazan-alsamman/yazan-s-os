import { getDb } from "@/lib/db/client";
import { relationRoute } from "@/lib/http/crud-routes";
import { goalMilestonesSchema } from "@/modules/goals/goal.schemas";
import { createGoalService } from "@/modules/goals/goal.service";

export const dynamic = "force-dynamic";

/** PUT /api/v1/goals/:id/milestones — replace the goal's milestones (owner-checked, audited). */
export const { PUT } = relationRoute("goals.milestones", goalMilestonesSchema, (ctx, id, body) =>
  createGoalService(getDb()).replaceMilestones(ctx, id, body.milestoneIds),
);
