import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import {
  createSkillIntelligenceService,
  skillIntelligenceQuerySchema,
} from "@/modules/skills/skill-intelligence.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/skills/intelligence — evidence-derived level, gap, freshness and trend per skill
 * (filters: category, active, hasTarget, level, freshness, gap, critical, targetWithoutEvidence,
 * trend, productionLinked; sort; page ≤ 100). Source list for every skill metric (ADR 0029).
 */
export const GET = defineUserRoute(
  "v1.skills.intelligence",
  async ({ request, ctx }) =>
    createSkillIntelligenceService(getDb()).list(
      ctx,
      parseQuery(request, skillIntelligenceQuerySchema),
    ),
  { rateLimit: RateLimits.analytics },
);
