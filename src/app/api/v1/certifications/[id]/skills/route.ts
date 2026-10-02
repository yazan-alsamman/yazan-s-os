import { z } from "zod";

import { getDb } from "@/lib/db/client";
import { relationRoute } from "@/lib/http/crud-routes";
import { createCertificationService } from "@/modules/certifications/certification.service";
import { idSetSchema } from "@/modules/shared/fields";

export const dynamic = "force-dynamic";

/** PUT — replace the full set of related records (ADR 0015). */
export const { PUT } = relationRoute(
  "certifications.skills",
  z.object({ skillIds: idSetSchema }),
  (ctx, id, body) => createCertificationService(getDb()).replaceSkills(ctx, id, body.skillIds),
);
