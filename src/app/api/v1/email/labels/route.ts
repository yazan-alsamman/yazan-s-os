import { getDb } from "@/lib/db/client";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createGmailService } from "@/modules/integrations/google/gmail.service";
export const dynamic = "force-dynamic";
/** GET /api/v1/email/labels — the account's Gmail labels. */
export const GET = defineUserRoute(
  "v1.email.labels",
  async ({ ctx }) => ({ data: await createGmailService(getDb()).listLabels(ctx) }),
  { rateLimit: RateLimits.integration },
);
