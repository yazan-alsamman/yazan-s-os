import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import { parseInput } from "@/lib/validation/parse";
import { githubEvidenceSchema } from "@/modules/evidence/evidence.schemas";
import { createGithubEvidenceService } from "@/modules/evidence/github-evidence.service";
import {
  createOpportunitySchema,
  createRequirementSchema,
} from "@/modules/opportunities/opportunity.schemas";
import { createOpportunityService } from "@/modules/opportunities/opportunity.service";
import type { ServiceContext } from "@/modules/shared/service-context";

import { contextFor, createTestUser, truncateAll } from "./database";

// Route literals through the real schemas (as the HTTP layer does) to get the exact input types.
const mkOpp = (p: Record<string, unknown>) => parseInput(createOpportunitySchema, p);
const mkReq = (p: Record<string, unknown>) => parseInput(createRequirementSchema, p);
const mkGh = (p: Record<string, unknown>) => parseInput(githubEvidenceSchema, p);

/**
 * Phase 10 — Opportunities, structured requirements, transparent evidence matching, controlled
 * GitHub → evidence linking, and owner isolation. Services are exercised against the real test DB.
 */
const db = getDb();
const svc = createOpportunityService(db);
const ghEvidence = createGithubEvidenceService(db);

async function makeSkill(userId: string, name: string) {
  return db.skill.create({ data: { userId, name, key: name.toLowerCase().replace(/\s+/g, "-") } });
}
async function makeEvidence(userId: string, title: string, verified: boolean) {
  return db.evidence.create({
    data: { userId, type: "document", title, verified, verifiedAt: verified ? new Date() : null },
  });
}

describe("Phase 10 opportunities & matching", () => {
  let alice: ServiceContext;
  let bob: ServiceContext;

  beforeEach(async () => {
    await truncateAll();
    alice = contextFor(await createTestUser("opp-alice"));
    bob = contextFor(await createTestUser("opp-bob"));
  });
  afterAll(truncateAll);

  it("creates, lists, updates and deletes opportunities with provenance", async () => {
    const created = await svc.create(alice, mkOpp({ title: "Staff Engineer", organization: "Acme", type: "role" }));
    expect(created.origin).toBe("manual");
    expect(created.status).toBe("identified");

    const listed = await svc.list(alice, { page: 1, pageSize: 20, sort: [{ updatedAt: "desc" }] } as never);
    expect(listed.data).toHaveLength(1);

    const updated = await svc.update(alice, created.id, { status: "applied", priority: "high" });
    expect(updated.status).toBe("applied");
    expect(updated.priority).toBe("high");

    await svc.delete(alice, created.id);
    await expect(svc.get(alice, created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("adds structured requirements and validates concrete-link ownership", async () => {
    const opp = await svc.create(alice, mkOpp({ title: "Backend role" }));
    const aliceSkill = await makeSkill(alice.userId, "PostgreSQL");
    const bobSkill = await makeSkill(bob.userId, "PostgreSQL");

    const req = await svc.addRequirement(alice, opp.id, mkReq({
      kind: "skill",
      label: "Advanced PostgreSQL",
      importance: "required",
      skillId: aliceSkill.id,
    }));
    expect(req.skill?.id).toBe(aliceSkill.id);

    // Linking another user's skill is rejected as if it does not exist (no cross-owner leak).
    await expect(
      svc.addRequirement(alice, opp.id, mkReq({ kind: "skill", label: "x", skillId: bobSkill.id })),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("maps evidence to requirements and computes transparent coverage", async () => {
    const opp = await svc.create(alice, mkOpp({ title: "Role" }));
    const r1 = await svc.addRequirement(alice, opp.id, mkReq({ kind: "skill", label: "PostgreSQL", importance: "required" }));
    const r2 = await svc.addRequirement(alice, opp.id, mkReq({ kind: "other", label: "Kubernetes 5y", importance: "required" }));
    await svc.addRequirement(alice, opp.id, mkReq({ kind: "other", label: "Nice to have", importance: "preferred" }));

    const verified = await makeEvidence(alice.userId, "Prod PostgreSQL deployment", true);
    const unverified = await makeEvidence(alice.userId, "Draft note", false);

    await svc.replaceRequirementEvidence(alice, r1.id, [verified.id]);
    await svc.replaceRequirementEvidence(alice, r2.id, [unverified.id]); // evidence exists but unverified

    const fit = await svc.getFit(alice, opp.id);
    expect(fit.coverage.required).toMatchObject({ total: 2, supported: 1, partial: 1, unsupported: 0 });
    expect(fit.coverage.preferred).toMatchObject({ total: 1, unsupported: 1 });
    expect(fit.coverage.requiredCoverage).toBe(0.5);

    const fr1 = fit.requirements.find((r) => r.id === r1.id)!;
    const fr2 = fit.requirements.find((r) => r.id === r2.id)!;
    expect(fr1.status).toBe("supported");
    expect(fr2.status).toBe("partial"); // unverified evidence is never counted as supported
  });

  it("rejects mapping evidence the caller does not own", async () => {
    const opp = await svc.create(alice, mkOpp({ title: "Role" }));
    const req = await svc.addRequirement(alice, opp.id, mkReq({ kind: "other", label: "X" }));
    const bobEvidence = await makeEvidence(bob.userId, "Bob's evidence", true);
    await expect(
      svc.replaceRequirementEvidence(alice, req.id, [bobEvidence.id]),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("suggests grounded evidence from a requirement's linked skill (never fabricated)", async () => {
    const opp = await svc.create(alice, mkOpp({ title: "Role" }));
    const skill = await makeSkill(alice.userId, "PostgreSQL");
    const req = await svc.addRequirement(alice, opp.id, mkReq({ kind: "skill", label: "PostgreSQL", skillId: skill.id }));

    const linked = await makeEvidence(alice.userId, "PostgreSQL talk", true);
    await db.skillEvidence.create({ data: { userId: alice.userId, skillId: skill.id, evidenceId: linked.id } });
    const alsoLinkedButMapped = await makeEvidence(alice.userId, "Already mapped", true);
    await db.skillEvidence.create({
      data: { userId: alice.userId, skillId: skill.id, evidenceId: alsoLinkedButMapped.id },
    });
    await svc.replaceRequirementEvidence(alice, req.id, [alsoLinkedButMapped.id]);

    const fit = await svc.getFit(alice, opp.id);
    const fr = fit.requirements.find((r) => r.id === req.id)!;
    const suggestionIds = fr.suggestions.map((s) => s.id);
    expect(suggestionIds).toContain(linked.id); // skill-linked, not yet mapped
    expect(suggestionIds).not.toContain(alsoLinkedButMapped.id); // already mapped → not re-suggested
  });

  it("creates evidence from a synchronized GitHub resource with provenance, never fabricated", async () => {
    // Seed a connection, a repository resource and a PR in Alice's synchronized data.
    const conn = await db.integrationConnection.create({
      data: {
        userId: alice.userId,
        provider: "github",
        status: "connected",
        externalAccountId: "7",
        accountLogin: "octo",
        displayName: "octo",
      },
    });
    await db.integrationExternalResource.create({
      data: {
        userId: alice.userId,
        connectionId: conn.id,
        provider: "github",
        resourceType: "repository",
        externalId: "100",
        displayName: "octo/alpha",
        url: "https://github.com/octo/alpha",
        metadata: { fullName: "octo/alpha", pushedDate: "2026-01-01T00:00:00.000Z" },
        observedAt: new Date(),
        lastSyncedAt: new Date(),
      },
    });
    await db.gitHubPullRequest.create({
      data: {
        userId: alice.userId,
        connectionId: conn.id,
        repoExternalId: "100",
        repoFullName: "octo/alpha",
        externalId: "9001",
        number: 42,
        title: "Add connection pooling",
        state: "closed",
        merged: true,
        url: "https://github.com/octo/alpha/pull/42",
        ghCreatedAt: new Date("2026-01-02T00:00:00.000Z"),
        mergedAt: new Date("2026-01-05T00:00:00.000Z"),
      },
    });

    const repoEvidence = await ghEvidence.create(alice, mkGh({
      resourceType: "repository",
      repoExternalId: "100",
      resourceId: "100",
    }));
    expect(repoEvidence.github).toMatchObject({ resourceType: "repository", resourceId: "100" });
    expect(repoEvidence.verified).toBe(false); // GitHub-derived starts pending review
    expect(repoEvidence.sourceUrl).toBe("https://github.com/octo/alpha");

    const prEvidence = await ghEvidence.create(alice, mkGh({
      resourceType: "pull_request",
      repoExternalId: "100",
      resourceId: "42",
    }));
    expect(prEvidence.title).toContain("Add connection pooling");
    expect(prEvidence.github).toMatchObject({ resourceType: "pull_request", resourceId: "42" });

    // A resource the owner has not synchronized is "not found" — nothing is fabricated.
    await expect(
      ghEvidence.create(alice, mkGh({ resourceType: "pull_request", repoExternalId: "100", resourceId: "999" })),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Bob cannot link Alice's GitHub resource.
    await expect(
      ghEvidence.create(bob, mkGh({ resourceType: "repository", repoExternalId: "100", resourceId: "100" })),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("isolates opportunities, requirements and fit by owner", async () => {
    const opp = await svc.create(alice, mkOpp({ title: "Alice's role" }));
    await svc.addRequirement(alice, opp.id, mkReq({ kind: "other", label: "X" }));

    await expect(svc.get(bob, opp.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(svc.update(bob, opp.id, { status: "applied" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(svc.delete(bob, opp.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(svc.getFit(bob, opp.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const bobList = await svc.list(bob, { page: 1, pageSize: 20, sort: [{ updatedAt: "desc" }] } as never);
    expect(bobList.data).toHaveLength(0);
  });
});
