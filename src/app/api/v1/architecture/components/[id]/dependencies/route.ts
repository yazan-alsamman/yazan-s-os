import { getDb } from "@/lib/db/client";
import { relationRoute } from "@/lib/http/crud-routes";
import { componentDependenciesSchema } from "@/modules/architecture/architecture.schemas";
import { createComponentService } from "@/modules/architecture/component.service";

export const dynamic = "force-dynamic";

/** PUT — replace the components this one depends on (no self-dependency; audited). */
export const { PUT } = relationRoute(
  "architecture.components.dependencies",
  componentDependenciesSchema,
  (ctx, id, body) =>
    createComponentService(getDb()).replaceDependencies(ctx, id, body.componentIds),
);
