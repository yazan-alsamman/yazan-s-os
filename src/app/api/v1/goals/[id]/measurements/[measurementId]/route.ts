import { getDb } from "@/lib/db/client";
import { parseId } from "@/lib/http/params";
import { noContent } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { createGoalService } from "@/modules/goals/goal.service";

export const dynamic = "force-dynamic";

/** DELETE one recorded measurement of the caller's goal. */
export const DELETE = defineUserRoute<{ id: string; measurementId: string }>(
  "v1.goals.measurements.delete",
  async ({ params, ctx }) => {
    await createGoalService(getDb()).deleteMeasurement(
      ctx,
      parseId(params.id),
      parseId(params.measurementId),
    );
    return noContent();
  },
);
