import { getDb } from "@/lib/db/client";
import { parseBody, parseId } from "@/lib/http/params";
import { created } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { createMetricSchema } from "@/modules/experiments/experiment.schemas";
import { createExperimentService } from "@/modules/experiments/experiment.service";

export const dynamic = "force-dynamic";

type Params = { id: string; runId: string };

/** POST /api/v1/experiments/:id/runs/:runId/metrics — record one evaluation result. */
export const POST = defineUserRoute<Params>(
  "v1.experiments.runs.metrics.create",
  async ({ request, params, ctx }) =>
    created(
      await createExperimentService(getDb()).addMetric(
        ctx,
        parseId(params.id),
        parseId(params.runId),
        await parseBody(request, createMetricSchema),
      ),
    ),
);
