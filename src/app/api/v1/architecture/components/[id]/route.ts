import { getDb } from "@/lib/db/client";
import { itemRoutes } from "@/lib/http/crud-routes";
import { updateComponentSchema } from "@/modules/architecture/architecture.schemas";
import { createComponentService } from "@/modules/architecture/component.service";

export const dynamic = "force-dynamic";

/** GET · PATCH · DELETE (removes the component's links, never the linked records). */
export const { GET, PATCH, DELETE } = itemRoutes(
  "architecture.components",
  () => createComponentService(getDb()),
  { update: updateComponentSchema },
);
