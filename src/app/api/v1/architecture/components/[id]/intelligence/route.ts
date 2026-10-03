import { getDb } from "@/lib/db/client";
import { parseId } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createArchitectureIntelligenceService } from "@/modules/architecture/architecture-intelligence";

export const dynamic = "force-dynamic";

/** GET — the map node detail (01 §5): purpose, projects, technologies, dependencies, decisions. */
export const GET = defineUserRoute<{ id: string }>(
  "v1.architecture.components.intelligence",
  async ({ params, ctx }) => ({
    data: await createArchitectureIntelligenceService(getDb()).getComponent(
      ctx,
      parseId(params.id),
    ),
  }),
  { rateLimit: RateLimits.analytics },
);
