import { getDb } from "@/lib/db/client";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createDriveService } from "@/modules/integrations/google/drive.service";
export const dynamic = "force-dynamic";
interface P {
  id: string;
}
/** GET /api/v1/drive/files/:id — one file's metadata (open the content in Google). */
export const GET = defineUserRoute<P>(
  "v1.drive.file",
  async ({ params, ctx }) => ({ data: await createDriveService(getDb()).getFile(ctx, params.id) }),
  { rateLimit: RateLimits.integration },
);
