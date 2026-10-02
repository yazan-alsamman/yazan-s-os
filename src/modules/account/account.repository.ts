import type { PrismaClient } from "@/generated/prisma/client";

/** Explicit projection: never select credential or token columns for API responses. */
const accountSelect = {
  id: true,
  email: true,
  name: true,
  image: true,
  timezone: true,
  locale: true,
  createdAt: true,
} as const;

export function createAccountRepository(db: PrismaClient) {
  return {
    findById(userId: string) {
      return db.user.findUnique({ where: { id: userId }, select: accountSelect });
    },
  };
}

export type AccountRepository = ReturnType<typeof createAccountRepository>;
