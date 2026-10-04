import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createGmailService } from "@/modules/integrations/google/gmail.service";
import { listThreadsQuerySchema } from "@/modules/integrations/integration.schemas";
export const dynamic = "force-dynamic";
/** GET /api/v1/email/threads — Gmail threads for a label or search (live; bodies never cached). */
export const GET = defineUserRoute(
  "v1.email.threads",
  async ({ request, ctx }) => ({
    data: await createGmailService(getDb()).listThreads(
      ctx,
      parseQuery(request, listThreadsQuerySchema),
    ),
  }),
  { rateLimit: RateLimits.integration },
);
