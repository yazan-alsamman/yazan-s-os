import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import { parseId } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createGitHubService } from "@/modules/integrations/github/github.service";
import { createIntegrationService } from "@/modules/integrations/integration.service";

export const dynamic = "force-dynamic";
interface P {
  id: string;
}

/** POST /api/v1/integrations/:id/sync — synchronize the connection's resources (GitHub repos). */
export const POST = defineUserRoute<P>(
  "v1.integrations.sync",
  async ({ params, ctx }) => {
    const db = getDb();
    const connection = await createIntegrationService(db).getConnection(ctx, parseId(params.id));
    if (connection.provider !== "github") {
      throw new AppError("INTEGRATION_NOT_CONFIGURED", {
        message: "Synchronization for this provider is not available yet.",
      });
    }
    return { data: await createGitHubService(db).sync(ctx) };
  },
  { rateLimit: RateLimits.integration },
);
