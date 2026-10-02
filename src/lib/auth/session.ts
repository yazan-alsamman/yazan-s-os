import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { AppError } from "@/lib/errors/app-error";

import { getAuth } from "./auth";
import type { AuthenticatedUser } from "./ownership";

export const SIGN_IN_PATH = "/sign-in";

async function resolveSession(requestHeaders: Headers) {
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const user: AuthenticatedUser = {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
  return { user, session: session.session };
}

/** Server-validated session for the current request (memoised per render). */
export const getCurrentSession = cache(async () => resolveSession(await headers()));

/**
 * For Server Components and Server Actions: the authenticated user, or a redirect to
 * sign-in. Validation happens against the database-backed session, not the cookie alone.
 */
export async function requireAuthenticatedUser(): Promise<AuthenticatedUser> {
  const current = await getCurrentSession();
  if (!current) redirect(SIGN_IN_PATH);
  return current.user;
}

/** For Route Handlers: the authenticated user, or an UNAUTHENTICATED AppError (HTTP 401). */
export async function requireApiUser(request: Request): Promise<AuthenticatedUser> {
  const current = await resolveSession(request.headers);
  if (!current) throw new AppError("UNAUTHENTICATED");
  return current.user;
}
