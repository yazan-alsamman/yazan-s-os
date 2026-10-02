import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getDb } from "@/lib/db/client";
import { logger } from "@/lib/observability/logger";
import { createAccountRepository } from "@/modules/account/account.repository";
import { createAccountService } from "@/modules/account/account.service";
import { createAuditRepository } from "@/modules/audit/audit.repository";
import { createAuditService } from "@/modules/audit/audit.service";

import { createTestUser, truncateAll } from "./database";

/**
 * The ownership invariant (ADR 0003): changing an ID must never expose another user's
 * record. Verified against the real database through the service + repository layers.
 */
describe("user ownership enforcement", () => {
  const audit = createAuditService({ repository: createAuditRepository(getDb()), logger });
  const accounts = createAccountService({ repository: createAccountRepository(getDb()) });

  beforeEach(truncateAll);
  afterAll(() => getDb().$disconnect());

  it("returns an owned audit entry to its owner", async () => {
    const alice = await createTestUser("alice");
    await audit.record({ actorId: alice.id, action: "test.owned", entityType: "user" });
    const [entry] = await createAuditRepository(getDb()).listForActor(alice.id, { limit: 1 });

    await expect(audit.getOwnedEntry(alice.id, entry!.id)).resolves.toMatchObject({
      id: entry!.id,
      actorId: alice.id,
    });
  });

  it("refuses another user's audit entry exactly like a missing one", async () => {
    const alice = await createTestUser("alice");
    const mallory = await createTestUser("mallory");
    await audit.record({ actorId: alice.id, action: "test.owned", entityType: "user" });
    const [entry] = await createAuditRepository(getDb()).listForActor(alice.id, { limit: 1 });

    const foreign = audit.getOwnedEntry(mallory.id, entry!.id);
    const missing = audit.getOwnedEntry(mallory.id, crypto.randomUUID());
    await expect(foreign).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(missing).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lists only the caller's own entries", async () => {
    const alice = await createTestUser("alice");
    const bob = await createTestUser("bob");
    await audit.record({ actorId: alice.id, action: "test.a", entityType: "user" });
    await audit.record({ actorId: bob.id, action: "test.b", entityType: "user" });

    const listed = await createAuditRepository(getDb()).listForActor(alice.id, { limit: 10 });
    expect(listed.map((e) => e.action)).toEqual(["test.a"]);
  });

  it("returns the caller's own account without credential fields", async () => {
    const alice = await createTestUser("alice");
    const view = await accounts.getOwnAccount({
      id: alice.id,
      email: alice.email,
      name: alice.name,
    });
    expect(view).toMatchObject({ id: alice.id, email: alice.email });
    expect(Object.keys(view)).not.toContain("password");
  });

  it("never writes an audit failure through to the caller", async () => {
    // Foreign-key violation: actor does not exist. record() must log, not throw.
    await expect(
      audit.record({ actorId: crypto.randomUUID(), action: "test.fk", entityType: "user" }),
    ).resolves.toBeUndefined();
  });
});
