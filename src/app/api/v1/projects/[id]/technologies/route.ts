import { z } from "zod";

import { getDb } from "@/lib/db/client";
import { relationRoute } from "@/lib/http/crud-routes";
import { technologyLinksSchema } from "@/modules/projects/project.schemas";
import { createProjectService } from "@/modules/projects/project.service";

export const dynamic = "force-dynamic";

/** PUT /api/v1/projects/:id/technologies — replace the project's technology usages. */
export const { PUT } = relationRoute(
  "projects.technologies",
  z.object({ technologies: technologyLinksSchema }),
  (ctx, id, body) => createProjectService(getDb()).replaceTechnologies(ctx, id, body.technologies),
);
