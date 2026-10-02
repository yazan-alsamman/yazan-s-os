import { z } from "zod";

import { getDb } from "@/lib/db/client";
import { relationRoute } from "@/lib/http/crud-routes";
import { createProjectService } from "@/modules/projects/project.service";
import { idSetSchema } from "@/modules/shared/fields";

export const dynamic = "force-dynamic";

/** PUT /api/v1/projects/:id/evidence — replace the project's linked evidence. */
export const { PUT } = relationRoute(
  "projects.evidence",
  z.object({ evidenceIds: idSetSchema }),
  (ctx, id, body) => createProjectService(getDb()).replaceEvidence(ctx, id, body.evidenceIds),
);
