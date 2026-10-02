import { getDb } from "@/lib/db/client";
import { itemRoutes } from "@/lib/http/crud-routes";
import { updateProjectSchema } from "@/modules/projects/project.schemas";
import { createProjectService } from "@/modules/projects/project.service";

export const dynamic = "force-dynamic";

/** GET (detail with relationships + provenance) · PATCH · DELETE. */
export const { GET, PATCH, DELETE } = itemRoutes("projects", () => createProjectService(getDb()), {
  update: updateProjectSchema,
});
