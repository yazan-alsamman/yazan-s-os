import { getDb } from "@/lib/db/client";
import { itemRoutes } from "@/lib/http/crud-routes";
import {
  createLevelModelService,
  levelModelUpdateSchema,
} from "@/modules/skills/level-model.service";

export const dynamic = "force-dynamic";

/** GET · PATCH · DELETE (409 while skills use the model) one of the caller's level models. */
export const { GET, PATCH, DELETE } = itemRoutes(
  "skill_level_models",
  () => createLevelModelService(getDb()),
  { update: levelModelUpdateSchema },
);
