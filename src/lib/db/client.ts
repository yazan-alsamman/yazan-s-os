import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { getServerEnv } from "@/lib/config/env";

export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const globalForPrisma = globalThis as unknown as { peosPrisma?: PrismaClient };

/** Process-wide Prisma client (reused across dev hot reloads). */
export function getDb(): PrismaClient {
  globalForPrisma.peosPrisma ??= createPrismaClient(getServerEnv().DATABASE_URL);
  return globalForPrisma.peosPrisma;
}

export type { PrismaClient };
