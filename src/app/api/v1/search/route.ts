import { getDb } from "@/lib/db/client";
import { parseQuery } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { createSearchService, searchQuerySchema } from "@/modules/search/search.service";

export const dynamic = "force-dynamic";

/** GET /api/v1/search?q=…[&type=…&page=…] — user-scoped search across Phase 1 entities. */
export const GET = defineUserRoute("v1.search", async ({ request, ctx }) =>
  createSearchService(getDb()).search(ctx, parseQuery(request, searchQuerySchema)),
);
