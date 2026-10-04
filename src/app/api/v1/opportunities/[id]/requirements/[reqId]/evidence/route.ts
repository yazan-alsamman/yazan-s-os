import { getDb } from "@/lib/db/client";
import { parseBody, parseId } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { requirementEvidenceSchema } from "@/modules/opportunities/opportunity.schemas";
import { createOpportunityService } from "@/modules/opportunities/opportunity.service";

export const dynamic = "force-dynamic";

type Params = { id: string; reqId: string };

/** PUT — replace the full set of evidence mapped to a requirement (ADR 0015). */
export const PUT = defineUserRoute<Params>(
  "v1.opportunities.requirements.evidence.replace",
  async ({ request, params, ctx }) => {
    const body = await parseBody(request, requirementEvidenceSchema);
    return {
      data: await createOpportunityService(getDb()).replaceRequirementEvidence(
        ctx,
        parseId(params.reqId),
        body.evidenceIds,
      ),
    };
  },
);
