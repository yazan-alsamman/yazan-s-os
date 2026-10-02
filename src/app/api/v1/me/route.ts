import { requireApiUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { defineRoute } from "@/lib/http/route-handler";
import { createAccountRepository } from "@/modules/account/account.repository";
import { createAccountService } from "@/modules/account/account.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/me — the authenticated user's own account.
 * Reference implementation of the layering: route → auth → service → repository → Prisma.
 */
export const GET = defineRoute("v1.me.get", async ({ request }) => {
  const user = await requireApiUser(request);
  const service = createAccountService({ repository: createAccountRepository(getDb()) });
  return { data: await service.getOwnAccount(user) };
});
