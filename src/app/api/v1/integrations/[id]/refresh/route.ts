import { getDb } from "@/lib/db/client";
import { parseId } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createIntegrationService } from "@/modules/integrations/integration.service";
export const dynamic = "force-dynamic";
interface P {
  id: string;
}

export const POST = defineUserRoute<P>(
  "v1.integrations.refresh",
  async ({ params, ctx }) => ({
    data: await createIntegrationService(getDb()).refresh(ctx, parseId(params.id)),
  }),
  { rateLimit: RateLimits.integration },
);
