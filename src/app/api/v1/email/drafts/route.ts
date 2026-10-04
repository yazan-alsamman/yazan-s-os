import { getDb } from "@/lib/db/client";
import { parseBody } from "@/lib/http/params";
import { created } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createGmailService } from "@/modules/integrations/google/gmail.service";
import { draftSchema } from "@/modules/integrations/integration.schemas";
export const dynamic = "force-dynamic";
/** POST /api/v1/email/drafts — save a draft (remains a draft until the user explicitly sends). */
export const POST = defineUserRoute(
  "v1.email.draft",
  async ({ request, ctx }) =>
    created(
      await createGmailService(getDb()).saveDraft(ctx, await parseBody(request, draftSchema)),
    ),
  { rateLimit: RateLimits.integration },
);
