import { getDb } from "@/lib/db/client";
import { relationRoute } from "@/lib/http/crud-routes";
import { componentTechnologiesSchema } from "@/modules/architecture/architecture.schemas";
import { createComponentService } from "@/modules/architecture/component.service";

export const dynamic = "force-dynamic";

/** PUT — replace the component's technologies (existing Technology records; audited). */
export const { PUT } = relationRoute(
  "architecture.components.technologies",
  componentTechnologiesSchema,
  (ctx, id, body) =>
    createComponentService(getDb()).replaceTechnologies(ctx, id, body.technologyIds),
);
