import { getDb } from "@/lib/db/client";
import type { ServiceContext } from "@/modules/shared/service-context";

const TABLES = [
  "audit_logs",
  "import_records",
  "import_jobs",
  "project_skills",
  "technology_usages",
  "project_evidence",
  "skill_evidence",
  "certification_skills",
  "certification_evidence",
  "experience_evidence",
  "projects",
  "skills",
  "technologies",
  "certifications",
  "evidence",
  "experiences",
  "education",
  "profiles",
  "sessions",
  "accounts",
  "verifications",
  "users",
];

/** Remove all rows from PEOS tables (test database only — guarded in setup.ts). */
export async function truncateAll(): Promise<void> {
  await getDb().$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

/** Insert a user directly (fixture). Uses the reserved `.invalid` TLD — never a real address. */
export async function createTestUser(label: string) {
  return getDb().user.create({
    data: { email: `${label}-${crypto.randomUUID()}@peos-test.invalid`, name: `Test ${label}` },
  });
}

/** Service context for a fixture user. */
export function contextFor(user: { id: string }): ServiceContext {
  return { userId: user.id, requestId: `test-${crypto.randomUUID()}` };
}
