import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import {
  createSkillsAnalyticsService,
  skillsAnalyticsFiltersSchema,
} from "@/modules/analytics/skills-analytics.service";

export const dynamic = "force-dynamic";

/** GET /api/v1/analytics/skills — career analytics: coverage, gaps, freshness, levels, trend, radar. */
export const GET = defineUserRoute(
  "v1.analytics.skills",
  async ({ request, ctx }) => ({
    data: await createSkillsAnalyticsService(getDb()).summary(
      ctx,
      parseQuery(request, skillsAnalyticsFiltersSchema),
    ),
  }),
  { rateLimit: RateLimits.analytics },
);
