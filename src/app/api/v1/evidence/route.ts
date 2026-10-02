import { getDb } from "@/lib/db/client";
import { collectionRoutes } from "@/lib/http/crud-routes";
import { listEvidenceQuerySchema, createEvidenceSchema } from "@/modules/evidence/evidence.schemas";
import { createEvidenceService } from "@/modules/evidence/evidence.service";

export const dynamic = "force-dynamic";

export const { GET, POST } = collectionRoutes("evidence", () => createEvidenceService(getDb()), {
  list: listEvidenceQuerySchema,
  create: createEvidenceSchema,
});
