import { getDb } from "@/lib/db/client";
import { parseBody } from "@/lib/http/params";
import { defineUserRoute } from "@/lib/http/user-route";
import { updateProfileSchema } from "@/modules/profile/profile.schemas";
import { createProfileService } from "@/modules/profile/profile.service";

export const dynamic = "force-dynamic";

/** GET /api/v1/profile — the caller's own profile (identity + professional profile). */
export const GET = defineUserRoute("v1.profile.get", async ({ ctx }) => ({
  data: await createProfileService(getDb()).get(ctx),
}));

/** PATCH /api/v1/profile — partial update; creates the profile on first save. */
export const PATCH = defineUserRoute("v1.profile.update", async ({ request, ctx }) => {
  const input = await parseBody(request, updateProfileSchema);
  return { data: await createProfileService(getDb()).update(ctx, input) };
});
