import { getDb } from "@/lib/db/client";
import { itemRoutes } from "@/lib/http/crud-routes";
import { updateDecisionSchema } from "@/modules/architecture/architecture.schemas";
import { createDecisionService } from "@/modules/architecture/decision.service";

export const dynamic = "force-dynamic";

/** GET · PATCH (lifecycle, supersession) · DELETE (409 while it supersedes other decisions). */
export const { GET, PATCH, DELETE } = itemRoutes(
  "architecture.decisions",
  () => createDecisionService(getDb()),
  { update: updateDecisionSchema },
);
