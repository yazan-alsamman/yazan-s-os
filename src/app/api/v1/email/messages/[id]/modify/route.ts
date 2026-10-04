import { getDb } from "@/lib/db/client";
import { parseBody } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createGmailService } from "@/modules/integrations/google/gmail.service";
import { modifyMessageSchema } from "@/modules/integrations/integration.schemas";
export const dynamic = "force-dynamic";
interface P {
  id: string;
}
/** POST /api/v1/email/messages/:id/modify — star / read / archive / labels (explicit action). */
export const POST = defineUserRoute<P>(
  "v1.email.modify",
  async ({ request, params, ctx }) => ({
    data: await createGmailService(getDb()).modify(
      ctx,
      params.id,
      await parseBody(request, modifyMessageSchema),
    ),
  }),
  { rateLimit: RateLimits.integration },
);
