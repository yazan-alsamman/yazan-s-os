import { getDb } from "@/lib/db/client";
import { itemRoutes } from "@/lib/http/crud-routes";
import { updateTechnologySchema } from "@/modules/technologies/technology.schemas";
import { createTechnologyService } from "@/modules/technologies/technology.service";

export const dynamic = "force-dynamic";

export const { GET, PATCH, DELETE } = itemRoutes(
  "technologies",
  () => createTechnologyService(getDb()),
  {
    update: updateTechnologySchema,
  },
);
