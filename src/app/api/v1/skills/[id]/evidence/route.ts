import { z } from "zod";

import { getDb } from "@/lib/db/client";
import { relationRoute } from "@/lib/http/crud-routes";
import { skillEvidenceLinksSchema } from "@/modules/skills/skill.schemas";
import { createSkillService } from "@/modules/skills/skill.service";

export const dynamic = "force-dynamic";

/** PUT /api/v1/skills/:id/evidence — replace evidence links (strength + date). */
export const { PUT } = relationRoute(
  "skills.evidence",
  z.object({ evidence: skillEvidenceLinksSchema }),
  (ctx, id, body) => createSkillService(getDb()).replaceEvidence(ctx, id, body.evidence),
);
