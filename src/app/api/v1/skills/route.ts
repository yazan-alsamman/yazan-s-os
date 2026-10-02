import { getDb } from "@/lib/db/client";
import { collectionRoutes } from "@/lib/http/crud-routes";
import { createSkillSchema, listSkillsQuerySchema } from "@/modules/skills/skill.schemas";
import { createSkillService } from "@/modules/skills/skill.service";

export const dynamic = "force-dynamic";

export const { GET, POST } = collectionRoutes("skills", () => createSkillService(getDb()), {
  list: listSkillsQuerySchema,
  create: createSkillSchema,
});
