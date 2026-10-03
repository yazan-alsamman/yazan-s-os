import { getDb } from "@/lib/db/client";
import { relationRoute } from "@/lib/http/crud-routes";
import { decisionComponentsSchema } from "@/modules/architecture/architecture.schemas";
import { createDecisionService } from "@/modules/architecture/decision.service";

export const dynamic = "force-dynamic";

/** PUT — replace the components the decision governs (audited). */
export const { PUT } = relationRoute(
  "architecture.decisions.components",
  decisionComponentsSchema,
  (ctx, id, body) => createDecisionService(getDb()).replaceComponents(ctx, id, body.componentIds),
);
