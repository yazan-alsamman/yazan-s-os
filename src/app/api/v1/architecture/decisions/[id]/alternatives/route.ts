import { getDb } from "@/lib/db/client";
import { parseBody, parseId } from "@/lib/http/params";
import { created } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { alternativeSchema } from "@/modules/architecture/architecture.schemas";
import { createDecisionService } from "@/modules/architecture/decision.service";

export const dynamic = "force-dynamic";

/** POST — record an alternative considered for the decision (04 ArchitectureAlternative). */
export const POST = defineUserRoute<{ id: string }>(
  "v1.architecture.decisions.alternatives.create",
  async ({ request, params, ctx }) =>
    created(
      await createDecisionService(getDb()).addAlternative(
        ctx,
        parseId(params.id),
        await parseBody(request, alternativeSchema),
      ),
    ),
);
