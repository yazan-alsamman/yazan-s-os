import { z } from "zod";

import { getDb } from "@/lib/db/client";
import { relationRoute } from "@/lib/http/crud-routes";
import { createProjectService } from "@/modules/projects/project.service";
import { idSetSchema } from "@/modules/shared/fields";

export const dynamic = "force-dynamic";

/** PUT /api/v1/projects/:id/skills — replace the project's skill set. */
export const { PUT } = relationRoute(
  "projects.skills",
  z.object({ skillIds: idSetSchema }),
  (ctx, id, body) => createProjectService(getDb()).replaceSkills(ctx, id, body.skillIds),
);
