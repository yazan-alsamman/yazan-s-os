import { getDb } from "@/lib/db/client";
import { parseBody } from "@/lib/http/params";
import { created } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createGmailService } from "@/modules/integrations/google/gmail.service";
import { sendEmailSchema } from "@/modules/integrations/integration.schemas";
export const dynamic = "force-dynamic";
/** POST /api/v1/email/send — send an email. Requires confirm:true; never automatic. */
export const POST = defineUserRoute(
  "v1.email.send",
  async ({ request, ctx }) =>
    created(await createGmailService(getDb()).send(ctx, await parseBody(request, sendEmailSchema))),
  { rateLimit: RateLimits.integration },
);
