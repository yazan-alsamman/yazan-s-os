import { getDb } from "@/lib/db/client";
import { defineUserRoute } from "@/lib/http/user-route";
import { createIntegrationService } from "@/modules/integrations/integration.service";
export const dynamic = "force-dynamic";

/** GET /api/v1/integrations — the session user's connections (no tokens, ever). */
export const GET = defineUserRoute("v1.integrations.list", async ({ ctx }) => ({
  data: await createIntegrationService(getDb()).listConnections(ctx),
}));
