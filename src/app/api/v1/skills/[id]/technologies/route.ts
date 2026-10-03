import { getDb } from "@/lib/db/client";
import { relationRoute } from "@/lib/http/crud-routes";
import { skillTechnologiesSchema } from "@/modules/skills/skill.schemas";
import { createSkillService } from "@/modules/skills/skill.service";

export const dynamic = "force-dynamic";

/** PUT /api/v1/skills/:id/technologies — replace the skill's explicit technology links (ADR 0030). */
export const { PUT } = relationRoute(
  "skills.technologies",
  skillTechnologiesSchema,
  (ctx, id, body) => createSkillService(getDb()).replaceTechnologies(ctx, id, body.technologyIds),
);
