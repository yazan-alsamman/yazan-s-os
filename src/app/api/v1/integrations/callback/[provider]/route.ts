import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/config/env";
import { getDb } from "@/lib/db/client";
import { isAppError } from "@/lib/errors/app-error";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import {
  integrationProviderSchema,
  oauthCallbackSchema,
} from "@/modules/integrations/integration.schemas";
import { createIntegrationService } from "@/modules/integrations/integration.service";

export const dynamic = "force-dynamic";
interface P {
  provider: string;
}

/**
 * GET /api/v1/integrations/callback/:provider — OAuth redirect target. Validates the signed state,
 * exchanges the code and stores the connection, then redirects back to the settings page with a
 * result. Errors never leak provider internals; the user lands on an explained state.
 */
export const GET = defineUserRoute<P>(
  "v1.integrations.callback",
  async ({ request, params, ctx }) => {
    const dest = new URL("/settings/integrations", getServerEnv().APP_URL);
    const provider = integrationProviderSchema.safeParse(params.provider);
    if (!provider.success) {
      dest.searchParams.set("error", "unknown_provider");
      return NextResponse.redirect(dest);
    }
    const query = oauthCallbackSchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const data = query.success ? query.data : null;
    if (!data || data.error || !data.code || !data.state) {
      dest.searchParams.set("provider", provider.data);
      dest.searchParams.set("error", data?.error ?? "missing_parameters");
      return NextResponse.redirect(dest);
    }
    try {
      await createIntegrationService(getDb()).handleCallback(ctx, provider.data, {
        code: data.code,
        state: data.state,
      });
      dest.searchParams.set("connected", provider.data);
    } catch (error) {
      dest.searchParams.set("provider", provider.data);
      dest.searchParams.set("error", isAppError(error) ? error.code : "callback_failed");
    }
    return NextResponse.redirect(dest);
  },
  { rateLimit: RateLimits.integration },
);
