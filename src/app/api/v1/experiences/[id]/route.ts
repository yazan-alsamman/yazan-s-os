import { getDb } from "@/lib/db/client";
import { itemRoutes } from "@/lib/http/crud-routes";
import { updateExperienceSchema } from "@/modules/experiences/experience.schemas";
import { createExperienceService } from "@/modules/experiences/experience.service";

export const dynamic = "force-dynamic";

export const { GET, PATCH, DELETE } = itemRoutes(
  "experiences",
  () => createExperienceService(getDb()),
  {
    update: updateExperienceSchema,
  },
);
