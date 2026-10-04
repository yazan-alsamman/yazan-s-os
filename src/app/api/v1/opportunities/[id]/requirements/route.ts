import { getDb } from "@/lib/db/client";
import { parseBody, parseId } from "@/lib/http/params";
import { created } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { createRequirementSchema } from "@/modules/opportunities/opportunity.schemas";
import { createOpportunityService } from "@/modules/opportunities/opportunity.service";

export const dynamic = "force-dynamic";

/** POST — add a structured requirement to an opportunity. */
export const POST = defineUserRoute<{ id: string }>(
  "v1.opportunities.requirements.create",
  async ({ request, params, ctx }) => {
    const body = await parseBody(request, createRequirementSchema);
    return created(
      await createOpportunityService(getDb()).addRequirement(ctx, parseId(params.id), body),
    );
  },
);
