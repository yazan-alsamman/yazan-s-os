import { getDb } from "@/lib/db/client";
import { parseId, parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createExperimentIntelligenceService } from "@/modules/experiments/experiment-intelligence";
import { compareQuerySchema } from "@/modules/experiments/experiment.schemas";

export const dynamic = "force-dynamic";

/** GET /api/v1/experiments/:id/compare?a=&b= — diff two runs of the experiment (ADR 0038). */
export const GET = defineUserRoute<{ id: string }>(
  "v1.experiments.compare",
  async ({ request, params, ctx }) => ({
    data: await createExperimentIntelligenceService(getDb()).compare(
      ctx,
      parseId(params.id),
      parseQuery(request, compareQuerySchema),
    ),
  }),
  { rateLimit: RateLimits.analytics },
);
