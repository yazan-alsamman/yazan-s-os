import { getDb } from "@/lib/db/client";
import { itemRoutes } from "@/lib/http/crud-routes";
import { updateEvidenceSchema } from "@/modules/evidence/evidence.schemas";
import { createEvidenceService } from "@/modules/evidence/evidence.service";

export const dynamic = "force-dynamic";

export const { GET, PATCH, DELETE } = itemRoutes("evidence", () => createEvidenceService(getDb()), {
  update: updateEvidenceSchema,
});
