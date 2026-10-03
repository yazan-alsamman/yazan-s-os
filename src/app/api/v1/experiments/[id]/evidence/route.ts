import { getDb } from "@/lib/db/client";
import { relationRoute } from "@/lib/http/crud-routes";
import { experimentEvidenceSchema } from "@/modules/experiments/experiment.schemas";
import { createExperimentService } from "@/modules/experiments/experiment.service";

export const dynamic = "force-dynamic";

/** PUT /api/v1/experiments/:id/evidence — replace the experiment's evidence links (audited). */
export const { PUT } = relationRoute(
  "experiments.evidence",
  experimentEvidenceSchema,
  (ctx, id, body) => createExperimentService(getDb()).replaceEvidence(ctx, id, body.evidenceIds),
);
