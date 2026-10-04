import { getDb } from "@/lib/db/client";
import { parseId } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { createOpportunityService } from "@/modules/opportunities/opportunity.service";

export const dynamic = "force-dynamic";

/** GET the transparent evidence-to-requirement fit matrix for one opportunity. */
export const GET = defineUserRoute<{ id: string }>(
  "v1.opportunities.fit",
  async ({ params, ctx }) => ({
    data: await createOpportunityService(getDb()).getFit(ctx, parseId(params.id)),
  }),
);
