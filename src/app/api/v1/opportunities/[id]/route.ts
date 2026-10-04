import { getDb } from "@/lib/db/client";
import { itemRoutes } from "@/lib/http/crud-routes";
import { updateOpportunitySchema } from "@/modules/opportunities/opportunity.schemas";
import { createOpportunityService } from "@/modules/opportunities/opportunity.service";

export const dynamic = "force-dynamic";

export const { GET, PATCH, DELETE } = itemRoutes(
  "opportunities",
  () => createOpportunityService(getDb()),
  { update: updateOpportunitySchema },
);
