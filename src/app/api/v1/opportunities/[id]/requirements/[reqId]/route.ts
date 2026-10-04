import { getDb } from "@/lib/db/client";
import { parseBody, parseId } from "@/lib/http/params";
import { noContent } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { updateRequirementSchema } from "@/modules/opportunities/opportunity.schemas";
import { createOpportunityService } from "@/modules/opportunities/opportunity.service";

export const dynamic = "force-dynamic";

type Params = { id: string; reqId: string };

/** PATCH · DELETE one opportunity requirement (owner-scoped; audited). */
export const PATCH = defineUserRoute<Params>(
  "v1.opportunities.requirements.update",
  async ({ request, params, ctx }) => ({
    data: await createOpportunityService(getDb()).updateRequirement(
      ctx,
      parseId(params.reqId),
      await parseBody(request, updateRequirementSchema),
    ),
  }),
);

export const DELETE = defineUserRoute<Params>(
  "v1.opportunities.requirements.delete",
  async ({ params, ctx }) => {
    await createOpportunityService(getDb()).deleteRequirement(ctx, parseId(params.reqId));
    return noContent();
  },
);
