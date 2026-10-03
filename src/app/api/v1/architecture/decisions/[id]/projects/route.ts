import { getDb } from "@/lib/db/client";
import { relationRoute } from "@/lib/http/crud-routes";
import { decisionProjectsSchema } from "@/modules/architecture/architecture.schemas";
import { createDecisionService } from "@/modules/architecture/decision.service";

export const dynamic = "force-dynamic";

/** PUT — replace the decision's related projects (owner-checked, audited). */
export const { PUT } = relationRoute(
  "architecture.decisions.projects",
  decisionProjectsSchema,
  (ctx, id, body) => createDecisionService(getDb()).replaceProjects(ctx, id, body.projectIds),
);
