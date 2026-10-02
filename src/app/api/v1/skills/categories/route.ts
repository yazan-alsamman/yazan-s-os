import { getDb } from "@/lib/db/client";
import { defineUserRoute } from "@/lib/http/user-route";
import { listLevelModels } from "@/modules/skills/level-models";
import { createSkillService } from "@/modules/skills/skill.service";

export const dynamic = "force-dynamic";

/** GET /api/v1/skills/categories — categories in use + available level models (form options). */
export const GET = defineUserRoute("v1.skills.categories", async ({ ctx }) => ({
  data: {
    categories: await createSkillService(getDb()).categories(ctx),
    levelModels: listLevelModels(),
  },
}));
