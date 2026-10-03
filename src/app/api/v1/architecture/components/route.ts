import { getDb } from "@/lib/db/client";
import { parseBody, parseQuery } from "@/lib/http/params";
import { created } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import { RateLimits } from "@/lib/rate-limit/rate-limiter";
import { createArchitectureIntelligenceService } from "@/modules/architecture/architecture-intelligence";
import {
  createComponentSchema,
  listComponentsQuerySchema,
} from "@/modules/architecture/architecture.schemas";
import { createComponentService } from "@/modules/architecture/component.service";

export const dynamic = "force-dynamic";

/** GET — the component registry (source list for component metrics) · POST — add a component. */
export const GET = defineUserRoute(
  "v1.architecture.components.list",
  async ({ request, ctx }) =>
    createArchitectureIntelligenceService(getDb()).listComponents(
      ctx,
      parseQuery(request, listComponentsQuerySchema),
    ),
  { rateLimit: RateLimits.analytics },
);

export const POST = defineUserRoute("v1.architecture.components.create", async ({ request, ctx }) =>
  created(
    await createComponentService(getDb()).create(
      ctx,
      await parseBody(request, createComponentSchema),
    ),
  ),
);
