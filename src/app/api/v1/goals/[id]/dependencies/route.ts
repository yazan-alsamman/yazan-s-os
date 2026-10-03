import { getDb } from "@/lib/db/client";
import { relationRoute } from "@/lib/http/crud-routes";
import { goalDependenciesSchema } from "@/modules/goals/goal.schemas";
import { createGoalService } from "@/modules/goals/goal.service";

export const dynamic = "force-dynamic";

/** PUT /api/v1/goals/:id/dependencies — replace the goal's dependencies (owner-checked, audited). */
export const { PUT } = relationRoute(
  "goals.dependencies",
  goalDependenciesSchema,
  (ctx, id, body) => createGoalService(getDb()).replaceDependencies(ctx, id, body.goalIds),
);
