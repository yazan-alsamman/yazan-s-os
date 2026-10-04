import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createDriveService } from "@/modules/integrations/google/drive.service";
import { listFilesQuerySchema } from "@/modules/integrations/integration.schemas";
export const dynamic = "force-dynamic";
/** GET /api/v1/drive/files — Drive file/folder metadata (My Drive, folder, recent, shared, search). */
export const GET = defineUserRoute(
  "v1.drive.files",
  async ({ request, ctx }) => ({
    data: await createDriveService(getDb()).listFiles(
      ctx,
      parseQuery(request, listFilesQuerySchema),
    ),
  }),
  { rateLimit: RateLimits.integration },
);
