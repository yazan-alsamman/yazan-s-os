import { getDb } from "@/lib/db/client";
import { itemRoutes } from "@/lib/http/crud-routes";
import { updateEducationSchema } from "@/modules/education/education.schemas";
import { createEducationService } from "@/modules/education/education.service";

export const dynamic = "force-dynamic";

export const { GET, PATCH, DELETE } = itemRoutes(
  "education",
  () => createEducationService(getDb()),
  {
    update: updateEducationSchema,
  },
);
