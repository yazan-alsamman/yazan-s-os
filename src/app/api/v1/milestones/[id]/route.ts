import { getDb } from "@/lib/db/client";
import { itemRoutes } from "@/lib/http/crud-routes";
import { updateMilestoneSchema } from "@/modules/milestones/milestone.schemas";
import { createMilestoneService } from "@/modules/milestones/milestone.service";

export const dynamic = "force-dynamic";

/** GET · PATCH (incl. complete / reopen via status) · DELETE one of the caller's milestones. */
export const { GET, PATCH, DELETE } = itemRoutes(
  "milestones",
  () => createMilestoneService(getDb()),
  { update: updateMilestoneSchema },
);
