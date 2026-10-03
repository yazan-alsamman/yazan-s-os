import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import { created } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { integrationProviderSchema } from "@/modules/integrations/integration.schemas";
import { createIntegrationService } from "@/modules/integrations/integration.service";

export const dynamic = "force-dynamic";
interface P {
  provider: string;
}

/** POST /api/v1/integrations/connect/:provider — returns a provider authorize URL (signed state). */
export const POST = defineUserRoute<P>(
  "v1.integrations.connect",
  async ({ params, ctx }) => {
    const provider = integrationProviderSchema.safeParse(params.provider);
    if (!provider.success) throw new AppError("NOT_FOUND");
    return created(await createIntegrationService(getDb()).startConnect(ctx, provider.data));
  },
  { rateLimit: RateLimits.integration },
);
