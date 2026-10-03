import { getDb } from "@/lib/db/client";
import { parseId } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createSkillIntelligenceService } from "@/modules/skills/skill-intelligence.service";

export const dynamic = "force-dynamic";

/** GET /api/v1/skills/:id/intelligence — the skill dossier's analysis (404 for foreign skills). */
export const GET = defineUserRoute<{ id: string }>(
  "v1.skills.intelligence.get",
  async ({ params, ctx }) => ({
    data: await createSkillIntelligenceService(getDb()).get(ctx, parseId(params.id)),
  }),
  { rateLimit: RateLimits.analytics },
);
