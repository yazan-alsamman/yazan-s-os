import { AppError } from "@/lib/errors/app-error";

/** The identity every protected operation receives after server-side authentication. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

/**
 * Enforce that `resource` exists and belongs to `userId` (ADR 0003).
 *
 * Missing resources and resources owned by someone else both raise NOT_FOUND, so a
 * caller cannot learn that another user's record exists by guessing IDs.
 */
export function requireResourceOwnership<T>(
  resource: T | null | undefined,
  userId: string,
  getOwnerId: (resource: T) => string | null,
): T {
  if (resource == null || getOwnerId(resource) !== userId) {
    throw new AppError("NOT_FOUND");
  }
  return resource;
}

/**
 * Prisma `where` fragment that scopes a query to one owner. Repositories for user-owned
 * entities must combine every lookup with this (or an equivalent explicit filter).
 */
export function ownedBy(userId: string): { userId: string } {
  if (!userId) throw new AppError("UNAUTHENTICATED");
  return { userId };
}
