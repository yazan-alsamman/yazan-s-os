import { getDb } from "@/lib/db/client";
import { parseBody, parseQuery } from "@/lib/http/params";
import { created } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createArchitectureIntelligenceService } from "@/modules/architecture/architecture-intelligence";
import {
  createDecisionSchema,
  listDecisionsQuerySchema,
} from "@/modules/architecture/architecture.schemas";
import { createDecisionService } from "@/modules/architecture/decision.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/architecture/decisions — the caller's decision records with server-side filters
 * (structural + derived: revisitDue, staleCritical, incomplete), sort and pagination. The source
 * list for every decision metric. POST — document a decision (owner from the session).
 */
export const GET = defineUserRoute(
  "v1.architecture.decisions.list",
  async ({ request, ctx }) =>
    createArchitectureIntelligenceService(getDb()).listDecisions(
      ctx,
      parseQuery(request, listDecisionsQuerySchema),
    ),
  { rateLimit: RateLimits.analytics },
);

export const POST = defineUserRoute("v1.architecture.decisions.create", async ({ request, ctx }) =>
  created(
    await createDecisionService(getDb()).create(
      ctx,
      await parseBody(request, createDecisionSchema),
    ),
  ),
);
