import { getDb } from "@/lib/db/client";
import { relationRoute } from "@/lib/http/crud-routes";
import { decisionEvidenceSchema } from "@/modules/architecture/architecture.schemas";
import { createDecisionService } from "@/modules/architecture/decision.service";

export const dynamic = "force-dynamic";

/** PUT — replace the decision's evidence links (reuses Evidence; audited). */
export const { PUT } = relationRoute(
  "architecture.decisions.evidence",
  decisionEvidenceSchema,
  (ctx, id, body) => createDecisionService(getDb()).replaceEvidence(ctx, id, body.evidenceIds),
);
