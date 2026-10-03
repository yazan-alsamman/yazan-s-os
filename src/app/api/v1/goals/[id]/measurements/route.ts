import { getDb } from "@/lib/db/client";
import { parseBody, parseId } from "@/lib/http/params";
import { created } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { createMeasurementSchema } from "@/modules/goals/goal.schemas";
import { createGoalService } from "@/modules/goals/goal.service";

export const dynamic = "force-dynamic";

type Params = { id: string };

/** GET the goal's recorded measurements · POST record one (no future dates). */
export const GET = defineUserRoute<Params>("v1.goals.measurements.list", async ({ params, ctx }) =>
  createGoalService(getDb()).listMeasurements(ctx, parseId(params.id)),
);

export const POST = defineUserRoute<Params>(
  "v1.goals.measurements.create",
  async ({ request, params, ctx }) => {
    const goalId = parseId(params.id);
    const input = await parseBody(request, createMeasurementSchema);
    return created(await createGoalService(getDb()).addMeasurement(ctx, goalId, input));
  },
);
