import { getDb } from "@/lib/db/client";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createGmailService } from "@/modules/integrations/google/gmail.service";
export const dynamic = "force-dynamic";
interface P {
  id: string;
}
/** GET /api/v1/email/threads/:id — one thread with its messages (HTML sanitized). */
export const GET = defineUserRoute<P>(
  "v1.email.thread",
  async ({ params, ctx }) => ({
    data: await createGmailService(getDb()).getThread(ctx, params.id),
  }),
  { rateLimit: RateLimits.integration },
);
