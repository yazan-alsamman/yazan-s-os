import { getDb } from "@/lib/db/client";
import { itemRoutes } from "@/lib/http/crud-routes";
import { updateSkillSchema } from "@/modules/skills/skill.schemas";
import { createSkillService } from "@/modules/skills/skill.service";

export const dynamic = "force-dynamic";

export const { GET, PATCH, DELETE } = itemRoutes("skills", () => createSkillService(getDb()), {
  update: updateSkillSchema,
});
