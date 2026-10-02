import { getDb } from "@/lib/db/client";
import { parseBody, parseId } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { decisionSchema } from "@/modules/imports/import.schemas";
import { createImportService } from "@/modules/imports/import.service";

export const dynamic = "force-dynamic";

/** POST /api/v1/imports/:id/records/:recordId/decision — accept (create|update) or reject. */
export const POST = defineUserRoute<{ id: string; recordId: string }>(
  "v1.imports.decide",
  async ({ request, params, ctx }) => {
    const jobId = parseId(params.id);
    const recordId = parseId(params.recordId);
    const input = await parseBody(request, decisionSchema);
    return { data: await createImportService(getDb()).decide(ctx, jobId, recordId, input) };
  },
);
