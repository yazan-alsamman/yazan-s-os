import { getDb } from "@/lib/db/client";
import { parseId, parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { listImportRecordsQuerySchema } from "@/modules/imports/import.schemas";
import { createImportService } from "@/modules/imports/import.service";

export const dynamic = "force-dynamic";

/** GET /api/v1/imports/:id — job + paginated review queue (with diffs for duplicates). */
export const GET = defineUserRoute<{ id: string }>(
  "v1.imports.get",
  async ({ request, params, ctx }) =>
    createImportService(getDb()).getJob(
      ctx,
      parseId(params.id),
      parseQuery(request, listImportRecordsQuerySchema),
    ),
);
