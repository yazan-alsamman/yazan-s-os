import { getDb } from "@/lib/db/client";
import { parseId } from "@/lib/http/params";
import { noContent } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { createExperimentService } from "@/modules/experiments/experiment.service";

export const dynamic = "force-dynamic";

type Params = { id: string; runId: string; metricId: string };

/** DELETE one recorded evaluation metric. */
export const DELETE = defineUserRoute<Params>(
  "v1.experiments.runs.metrics.delete",
  async ({ params, ctx }) => {
    await createExperimentService(getDb()).deleteMetric(
      ctx,
      parseId(params.id),
      parseId(params.runId),
      parseId(params.metricId),
    );
    return noContent();
  },
);
