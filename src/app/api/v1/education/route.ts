import { getDb } from "@/lib/db/client";
import { collectionRoutes } from "@/lib/http/crud-routes";
import {
  listEducationQuerySchema,
  createEducationSchema,
} from "@/modules/education/education.schemas";
import { createEducationService } from "@/modules/education/education.service";

export const dynamic = "force-dynamic";

export const { GET, POST } = collectionRoutes("education", () => createEducationService(getDb()), {
  list: listEducationQuerySchema,
  create: createEducationSchema,
});
