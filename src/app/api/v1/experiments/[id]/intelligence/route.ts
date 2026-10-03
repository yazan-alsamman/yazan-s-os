import { getDb } from "@/lib/db/client";
import { parseId } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createExperimentIntelligenceService } from "@/modules/experiments/experiment-intelligence";

export const dynamic = "force-dynamic";

/** GET /api/v1/experiments/:id/intelligence — the dossier (runs, metrics, reproducibility, evidence). */
export const GET = defineUserRoute<{ id: string }>(
  "v1.experiments.intelligence",
  async ({ params, ctx }) => ({
    data: await createExperimentIntelligenceService(getDb()).get(ctx, parseId(params.id)),
  }),
  { rateLimit: RateLimits.analytics },
);
