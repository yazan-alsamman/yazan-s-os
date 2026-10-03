import { getDb } from "@/lib/db/client";
import { parseBody, parseId } from "@/lib/http/params";
import { created } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { createRunSchema } from "@/modules/experiments/experiment.schemas";
import { createExperimentService } from "@/modules/experiments/experiment.service";

export const dynamic = "force-dynamic";

/** POST /api/v1/experiments/:id/runs — append a run (never overwrites a previous run). */
export const POST = defineUserRoute<{ id: string }>(
  "v1.experiments.runs.create",
  async ({ request, params, ctx }) => {
    const experimentId = parseId(params.id);
    const input = await parseBody(request, createRunSchema);
    return created(await createExperimentService(getDb()).createRun(ctx, experimentId, input));
  },
);
