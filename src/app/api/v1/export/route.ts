import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createExportService, exportQuerySchema } from "@/modules/exports/export.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/export?format=json|csv[&entity=…] — download the caller's own data.
 * Generated on demand, streamed as an attachment, never stored, never cached.
 */
export const GET = defineUserRoute(
  "v1.export",
  async ({ request, ctx }) => {
    const query = parseQuery(request, exportQuerySchema);
    const file = await createExportService(getDb()).export(ctx, query);
    return new Response(file.body, {
      status: 200,
      headers: {
        "content-type": file.contentType,
        "content-disposition": `attachment; filename="${file.fileName}"`,
        "x-content-type-options": "nosniff",
      },
    });
  },
  { rateLimit: RateLimits.export },
);
