import { getDb } from "@/lib/db/client";
import { parseBody } from "@/lib/http/params";
import { created } from "@/lib/http/route-handler";
import { defineUserRoute } from "@/lib/http/user-route";
import {
  createLevelModelService,
  levelModelInputSchema,
} from "@/modules/skills/level-model.service";

export const dynamic = "force-dynamic";

/** GET the default and the caller's custom skill level models · POST create one (ADR 0026). */
export const GET = defineUserRoute("v1.skill_level_models.list", async ({ ctx }) =>
  createLevelModelService(getDb()).list(ctx),
);

export const POST = defineUserRoute("v1.skill_level_models.create", async ({ request, ctx }) =>
  created(
    await createLevelModelService(getDb()).create(
      ctx,
      await parseBody(request, levelModelInputSchema),
    ),
  ),
);
