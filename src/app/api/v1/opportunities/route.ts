import { getDb } from "@/lib/db/client";
import { collectionRoutes } from "@/lib/http/crud-routes";
import {
  createOpportunitySchema,
  listOpportunitiesQuerySchema,
} from "@/modules/opportunities/opportunity.schemas";
import { createOpportunityService } from "@/modules/opportunities/opportunity.service";

export const dynamic = "force-dynamic";

export const { GET, POST } = collectionRoutes(
  "opportunities",
  () => createOpportunityService(getDb()),
  { list: listOpportunitiesQuerySchema, create: createOpportunitySchema },
);
