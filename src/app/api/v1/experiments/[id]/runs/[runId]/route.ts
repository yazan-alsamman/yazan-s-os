import { getDb } from "@/lib/db/client";
import { parseBody, parseId } from "@/lib/http/params";
import { noContent } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { updateRunSchema } from "@/modules/experiments/experiment.schemas";
import { createExperimentService } from "@/modules/experiments/experiment.service";

export const dynamic = "force-dynamic";

type Params = { id: string; runId: string };

/** PATCH · DELETE a run of the experiment (owner-scoped; both audited). */
export const PATCH = defineUserRoute<Params>(
  "v1.experiments.runs.update",
  async ({ request, params, ctx }) => ({
    data: await createExperimentService(getDb()).updateRun(
      ctx,
      parseId(params.id),
      parseId(params.runId),
      await parseBody(request, updateRunSchema),
    ),
  }),
);

export const DELETE = defineUserRoute<Params>(
  "v1.experiments.runs.delete",
  async ({ params, ctx }) => {
    await createExperimentService(getDb()).deleteRun(
      ctx,
      parseId(params.id),
      parseId(params.runId),
    );
    return noContent();
  },
);
