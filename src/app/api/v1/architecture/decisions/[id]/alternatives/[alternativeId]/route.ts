import { getDb } from "@/lib/db/client";
import { parseBody, parseId } from "@/lib/http/params";
import { noContent } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { updateAlternativeSchema } from "@/modules/architecture/architecture.schemas";
import { createDecisionService } from "@/modules/architecture/decision.service";

export const dynamic = "force-dynamic";

type Params = { id: string; alternativeId: string };

/** PATCH · DELETE one alternative (owner-scoped; audited). */
export const PATCH = defineUserRoute<Params>(
  "v1.architecture.decisions.alternatives.update",
  async ({ request, params, ctx }) => ({
    data: await createDecisionService(getDb()).updateAlternative(
      ctx,
      parseId(params.id),
      parseId(params.alternativeId),
      await parseBody(request, updateAlternativeSchema),
    ),
  }),
);

export const DELETE = defineUserRoute<Params>(
  "v1.architecture.decisions.alternatives.delete",
  async ({ params, ctx }) => {
    await createDecisionService(getDb()).deleteAlternative(
      ctx,
      parseId(params.id),
      parseId(params.alternativeId),
    );
    return noContent();
  },
);
