import { getDb } from "@/lib/db/client";
import { itemRoutes } from "@/lib/http/crud-routes";
import { updateExperimentSchema } from "@/modules/experiments/experiment.schemas";
import { createExperimentService } from "@/modules/experiments/experiment.service";

export const dynamic = "force-dynamic";

/** GET · PATCH (incl. lifecycle transitions) · DELETE (cascades runs, metrics and evidence links). */
export const { GET, PATCH, DELETE } = itemRoutes(
  "experiments",
  () => createExperimentService(getDb()),
  { update: updateExperimentSchema },
);
