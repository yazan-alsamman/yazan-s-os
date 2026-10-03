import { getDb } from "@/lib/db/client";
import { relationRoute } from "@/lib/http/crud-routes";
import { goalSkillsSchema } from "@/modules/goals/goal.schemas";
import { createGoalService } from "@/modules/goals/goal.service";

export const dynamic = "force-dynamic";

/** PUT /api/v1/goals/:id/skills — replace the goal's skills (owner-checked, audited). */
export const { PUT } = relationRoute("goals.skills", goalSkillsSchema, (ctx, id, body) =>
  createGoalService(getDb()).replaceSkills(ctx, id, body.skillIds),
);
