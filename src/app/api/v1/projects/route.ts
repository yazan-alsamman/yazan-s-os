import { getDb } from "@/lib/db/client";
import { collectionRoutes } from "@/lib/http/crud-routes";
import { createProjectSchema, listProjectsQuerySchema } from "@/modules/projects/project.schemas";
import { createProjectService } from "@/modules/projects/project.service";

export const dynamic = "force-dynamic";

/** GET (list, search, filter, paginate) · POST (create with optional relationships). */
export const { GET, POST } = collectionRoutes("projects", () => createProjectService(getDb()), {
  list: listProjectsQuerySchema,
  create: createProjectSchema,
});
