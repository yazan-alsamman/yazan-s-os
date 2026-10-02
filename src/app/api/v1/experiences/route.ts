import { getDb } from "@/lib/db/client";
import { collectionRoutes } from "@/lib/http/crud-routes";
import {
  listExperiencesQuerySchema,
  createExperienceSchema,
} from "@/modules/experiences/experience.schemas";
import { createExperienceService } from "@/modules/experiences/experience.service";

export const dynamic = "force-dynamic";

export const { GET, POST } = collectionRoutes(
  "experiences",
  () => createExperienceService(getDb()),
  {
    list: listExperiencesQuerySchema,
    create: createExperienceSchema,
  },
);
