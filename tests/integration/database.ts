import { getDb } from "@/lib/db/client";

/** Remove all rows from PEOS tables (test database only — guarded in setup.ts). */
export async function truncateAll(): Promise<void> {
  await getDb().$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "sessions", "accounts", "verifications", "users" RESTART IDENTITY CASCADE',
  );
}

/** Insert a user directly (fixture). Uses the reserved `.invalid` TLD — never a real address. */
export async function createTestUser(label: string) {
  return getDb().user.create({
    data: { email: `${label}-${crypto.randomUUID()}@peos-test.invalid`, name: `Test ${label}` },
  });
}
