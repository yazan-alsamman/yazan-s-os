import { getDb } from "@/lib/db/client";
import { parseBody, parseId } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { updateSignalSchema } from "@/modules/intelligence/intelligence.schemas";
import { createIntelligenceService } from "@/modules/intelligence/intelligence.service";

export const dynamic = "force-dynamic";

/** PATCH — owner lifecycle transition on a signal (review / dismiss / reactivate). */
export const PATCH = defineUserRoute<{ id: string }>(
  "v1.intelligence.signals.update",
  async ({ request, params, ctx }) => ({
    data: await createIntelligenceService(getDb()).updateSignalStatus(
      ctx,
      parseId(params.id),
      await parseBody(request, updateSignalSchema),
    ),
  }),
);
