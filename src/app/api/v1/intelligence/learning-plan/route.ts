import { getDb } from "@/lib/db/client";
import { defineUserRoute } from "@/lib/http/user-route";
import { createIntelligenceService } from "@/modules/intelligence/intelligence.service";

export const dynamic = "force-dynamic";

/** GET — a grounded, on-demand personalized learning plan from real skill/opportunity gaps. */
export const GET = defineUserRoute("v1.intelligence.learning_plan", async ({ ctx }) => ({
  data: await createIntelligenceService(getDb()).learningPlan(ctx),
}));
