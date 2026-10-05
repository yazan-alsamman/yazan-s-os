import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { listSignalsQuerySchema } from "@/modules/intelligence/intelligence.schemas";
import { createIntelligenceService } from "@/modules/intelligence/intelligence.service";

export const dynamic = "force-dynamic";

/** GET — list continuous-intelligence signals (owner-scoped, filterable). */
export const GET = defineUserRoute("v1.intelligence.signals.list", async ({ request, ctx }) =>
  createIntelligenceService(getDb()).listSignals(ctx, parseQuery(request, listSignalsQuerySchema)),
);
