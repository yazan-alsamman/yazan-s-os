import { getDb } from "@/lib/db/client";
import { parseId } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createArchitectureIntelligenceService } from "@/modules/architecture/architecture-intelligence";

export const dynamic = "force-dynamic";

/** GET — the decision dossier: links, alternatives, supersession, revisit state, gaps, history. */
export const GET = defineUserRoute<{ id: string }>(
  "v1.architecture.decisions.intelligence",
  async ({ params, ctx }) => ({
    data: await createArchitectureIntelligenceService(getDb()).getDecision(ctx, parseId(params.id)),
  }),
  { rateLimit: RateLimits.analytics },
);
