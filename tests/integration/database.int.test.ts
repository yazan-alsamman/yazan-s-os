import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getDb } from "@/lib/db/client";

import { createTestUser, truncateAll } from "./database";

describe("PostgreSQL + Prisma foundation", () => {
  beforeEach(truncateAll);
  afterAll(() => getDb().$disconnect());

  it("connects to the isolated test database", async () => {
    const [row] = await getDb().$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    // The database named by TEST_DATABASE_URL (peos_test locally), never the dev database.
    expect(row?.db).toBe(new URL(process.env.DATABASE_URL!).pathname.slice(1));
    expect(row?.db).not.toBe("peos");
  });

  it("has every migration applied", async () => {
    const pending = await getDb().$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM "_prisma_migrations" WHERE finished_at IS NULL`;
    const applied = await getDb().$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
    expect(Number(pending[0]?.count)).toBe(0);
    expect(Number(applied[0]?.count)).toBeGreaterThan(0);
  });

  it("generates UUID ids and timestamps", async () => {
    const user = await createTestUser("ids");
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.timezone).toBe("UTC");
  });

  it("enforces unique emails", async () => {
    const user = await createTestUser("unique");
    await expect(
      getDb().user.create({ data: { email: user.email, name: "Duplicate" } }),
    ).rejects.toThrow();
  });

  it("enforces the lower-case email check constraint", async () => {
    await expect(
      getDb().user.create({ data: { email: "Mixed.Case@peos-test.invalid", name: "Case" } }),
    ).rejects.toThrow(/users_email_lowercase_chk/);
  });

  it("enforces non-blank names", async () => {
    await expect(
      getDb().user.create({ data: { email: "blank@peos-test.invalid", name: "   " } }),
    ).rejects.toThrow(/users_name_not_blank_chk/);
  });

  it("cascades sessions and nulls audit actors when a user is deleted", async () => {
    const user = await createTestUser("cascade");
    await getDb().session.create({
      data: {
        userId: user.id,
        token: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const entry = await getDb().auditLog.create({
      data: { actorId: user.id, action: "test.action", entityType: "user", entityId: user.id },
    });

    await getDb().user.delete({ where: { id: user.id } });

    expect(await getDb().session.count({ where: { userId: user.id } })).toBe(0);
    const kept = await getDb().auditLog.findUnique({ where: { id: entry.id } });
    expect(kept?.actorId).toBeNull();
  });
});
