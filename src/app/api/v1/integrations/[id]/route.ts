import { getDb } from "@/lib/db/client";
import { parseId } from "@/lib/http/params";
import { noContent } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createIntegrationService } from "@/modules/integrations/integration.service";
export const dynamic = "force-dynamic";
interface P {
  id: string;
}

/** GET a connection. */
export const GET = defineUserRoute<P>("v1.integrations.get", async ({ params, ctx }) => ({
  data: await createIntegrationService(getDb()).getConnection(ctx, parseId(params.id)),
}));

/** DELETE — disconnect: stop syncing and securely discard stored tokens. */
export const DELETE = defineUserRoute<P>(
  "v1.integrations.disconnect",
  async ({ params, ctx }) => {
    await createIntegrationService(getDb()).disconnect(ctx, parseId(params.id));
    return noContent();
  },
  { rateLimit: RateLimits.integration },
);
