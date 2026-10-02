import { getDb } from "@/lib/db/client";
import { parseId } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createProjectIntelligenceService } from "@/modules/projects/project-intelligence";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/projects/:id/intelligence — dossier analytics for one of the caller's projects:
 * lifecycle position, schedule, manual + computed health with component breakdown, milestone
 * delivery, evidence intelligence and technology mapping. 404 for foreign or missing projects.
 */
export const GET = defineUserRoute<{ id: string }>(
  "v1.projects.intelligence",
  async ({ params, ctx }) => ({
    data: await createProjectIntelligenceService(getDb()).get(ctx, parseId(params.id)),
  }),
  { rateLimit: RateLimits.analytics },
);
