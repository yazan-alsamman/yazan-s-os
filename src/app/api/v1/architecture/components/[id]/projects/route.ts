import { getDb } from "@/lib/db/client";
import { relationRoute } from "@/lib/http/crud-routes";
import { componentProjectsSchema } from "@/modules/architecture/architecture.schemas";
import { createComponentService } from "@/modules/architecture/component.service";

export const dynamic = "force-dynamic";

/** PUT — replace the component's projects (audited). */
export const { PUT } = relationRoute(
  "architecture.components.projects",
  componentProjectsSchema,
  (ctx, id, body) => createComponentService(getDb()).replaceProjects(ctx, id, body.projectIds),
);
