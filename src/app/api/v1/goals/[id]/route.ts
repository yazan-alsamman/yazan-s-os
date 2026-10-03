import { getDb } from "@/lib/db/client";
import { itemRoutes } from "@/lib/http/crud-routes";
import { updateGoalSchema } from "@/modules/goals/goal.schemas";
import { createGoalService } from "@/modules/goals/goal.service";

export const dynamic = "force-dynamic";

/** GET · PATCH (incl. lifecycle, parent) · DELETE (409 while child goals exist). */
export const { GET, PATCH, DELETE } = itemRoutes("goals", () => createGoalService(getDb()), {
  update: updateGoalSchema,
});
