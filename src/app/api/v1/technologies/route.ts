import { getDb } from "@/lib/db/client";
import { collectionRoutes } from "@/lib/http/crud-routes";
import {
  listTechnologiesQuerySchema,
  createTechnologySchema,
} from "@/modules/technologies/technology.schemas";
import { createTechnologyService } from "@/modules/technologies/technology.service";

export const dynamic = "force-dynamic";

export const { GET, POST } = collectionRoutes(
  "technologies",
  () => createTechnologyService(getDb()),
  {
    list: listTechnologiesQuerySchema,
    create: createTechnologySchema,
  },
);
