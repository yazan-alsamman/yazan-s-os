import { getDb } from "@/lib/db/client";
import { parseBody, parseQuery } from "@/lib/http/params";
import { created } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createExperimentIntelligenceService } from "@/modules/experiments/experiment-intelligence";
import {
  createExperimentSchema,
  listExperimentsQuerySchema,
} from "@/modules/experiments/experiment.schemas";
import { createExperimentService } from "@/modules/experiments/experiment.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/experiments — the caller's experiments with server-side filters (structural +
 * derived: hasEvaluation, reproducibility), sort and pagination. The source list for every AI
 * Lab metric. POST — create an experiment (owner from the session).
 */
export const GET = defineUserRoute(
  "v1.experiments.list",
  async ({ request, ctx }) =>
    createExperimentIntelligenceService(getDb()).list(
      ctx,
      parseQuery(request, listExperimentsQuerySchema),
    ),
  { rateLimit: RateLimits.analytics },
);

export const POST = defineUserRoute("v1.experiments.create", async ({ request, ctx }) =>
  created(
    await createExperimentService(getDb()).create(
      ctx,
      await parseBody(request, createExperimentSchema),
    ),
  ),
);
