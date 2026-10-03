import { getDb } from "@/lib/db/client";
import { defineUserRoute } from "@/lib/http/user-route";
import { createIntegrationService } from "@/modules/integrations/integration.service";
export const dynamic = "force-dynamic";

/** GET /api/v1/integrations/providers — connector registry with configuration + connection state. */
export const GET = defineUserRoute("v1.integrations.providers", async ({ ctx }) => ({
  data: await createIntegrationService(getDb()).listProviders(ctx),
}));
