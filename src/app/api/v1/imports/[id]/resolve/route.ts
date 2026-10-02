import { getDb } from "@/lib/db/client";
import { parseBody, parseId } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { resolveSchema } from "@/modules/imports/import.schemas";
import { createImportService } from "@/modules/imports/import.service";

export const dynamic = "force-dynamic";

/** POST /api/v1/imports/:id/resolve — bulk accept new valid records, or reject all pending. */
export const POST = defineUserRoute<{ id: string }>(
  "v1.imports.resolve",
  async ({ request, params, ctx }) => {
    const jobId = parseId(params.id);
    const { action } = await parseBody(request, resolveSchema);
    return { data: await createImportService(getDb()).resolve(ctx, jobId, action) };
  },
);
