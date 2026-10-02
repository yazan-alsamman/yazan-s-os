import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getDb } from "@/lib/db/client";
import { parseInput } from "@/lib/validation/parse";
import {
  createCertificationSchema,
  listCertificationsQuerySchema,
} from "@/modules/certifications/certification.schemas";
import { createCertificationService } from "@/modules/certifications/certification.service";
import {
  createEducationSchema,
  listEducationQuerySchema,
} from "@/modules/education/education.schemas";
import { createEducationService } from "@/modules/education/education.service";
import { createEvidenceSchema, listEvidenceQuerySchema } from "@/modules/evidence/evidence.schemas";
import { createEvidenceService } from "@/modules/evidence/evidence.service";
import {
  createExperienceSchema,
  listExperiencesQuerySchema,
} from "@/modules/experiences/experience.schemas";
import { createExperienceService } from "@/modules/experiences/experience.service";
import { createProfileService } from "@/modules/profile/profile.service";
import {
  createProjectSchema,
  listProjectsQuerySchema,
  updateProjectSchema,
} from "@/modules/projects/project.schemas";
import { createProjectService } from "@/modules/projects/project.service";
import { createSkillSchema, listSkillsQuerySchema } from "@/modules/skills/skill.schemas";
import { createSkillService } from "@/modules/skills/skill.service";
import {
  createTechnologySchema,
  listTechnologiesQuerySchema,
} from "@/modules/technologies/technology.schemas";
import { createTechnologyService } from "@/modules/technologies/technology.service";

import { contextFor, createTestUser, truncateAll } from "./database";

const db = getDb();

async function auditActions(userId: string) {
  return (
    await db.auditLog.findMany({ where: { actorId: userId }, orderBy: { createdAt: "asc" } })
  ).map((a) => a.action);
}

describe("Phase 1 CRUD (real PostgreSQL)", () => {
  beforeEach(truncateAll);
  afterAll(() => db.$disconnect());

  it("profile: created on first save, updated after, with audit and empty default state", async () => {
    const user = await createTestUser("profile");
    const ctx = contextFor(user);
    const service = createProfileService(db);

    const empty = await service.get(ctx);
    expect(empty).toMatchObject({ exists: false, headline: null, summary: null });

    const created = await service.update(ctx, {
      name: "Renamed",
      headline: "Engineer",
      timezone: "Europe/Istanbul",
      website: "https://example.invalid",
    });
    expect(created).toMatchObject({
      exists: true,
      name: "Renamed",
      headline: "Engineer",
      timezone: "Europe/Istanbul",
      provenance: { origin: "manual", import: null },
    });

    const updated = await service.update(ctx, { headline: null });
    expect(updated.headline).toBeNull();
    expect(updated.website).toBe("https://example.invalid");
    expect(await auditActions(user.id)).toEqual(["profile.created", "profile.updated"]);
  });

  it("projects: create → list → get → update → delete, slug generation and conflicts", async () => {
    const ctx = contextFor(await createTestUser("proj"));
    const service = createProjectService(db);
    const input = parseInput(createProjectSchema, {
      name: "Data Platform",
      description: "Core records",
      startDate: "2026-01-10",
      repositoryUrl: "https://git.example.invalid/repo",
    });

    const a = await service.create(ctx, input);
    const b = await service.create(ctx, input);
    expect(a.slug).toBe("data-platform");
    expect(b.slug).toBe("data-platform-2");
    expect(a).toMatchObject({
      status: "idea",
      healthStatus: "not_assessed",
      startDate: "2026-01-10",
    });

    await expect(
      service.create(ctx, parseInput(createProjectSchema, { name: "X", slug: "data-platform" })),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const list = await service.list(ctx, parseInput(listProjectsQuerySchema, { q: "platform" }));
    expect(list.page.total).toBe(2);
    expect(list.data[0]?.counts).toEqual({ skills: 0, technologies: 0, evidence: 0 });

    const updated = await service.update(
      ctx,
      a.id,
      parseInput(updateProjectSchema, { status: "archived", description: "" }),
    );
    expect(updated).toMatchObject({ status: "archived", description: null });

    await expect(
      service.update(ctx, a.id, parseInput(updateProjectSchema, { targetDate: "2025-01-01" })),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    await service.delete(ctx, a.id);
    await expect(service.get(ctx, a.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await auditActions(ctx.userId)).toEqual([
      "project.created",
      "project.created",
      "project.updated",
      "project.deleted",
    ]);
  });

  it("projects: filters by status and date range, sorts deterministically, paginates", async () => {
    const ctx = contextFor(await createTestUser("filter"));
    const service = createProjectService(db);
    for (const [name, status, startDate] of [
      ["Alpha", "development", "2025-01-01"],
      ["Bravo", "production", "2025-06-01"],
      ["Charlie", "production", "2026-01-01"],
    ] as const) {
      await service.create(ctx, parseInput(createProjectSchema, { name, status, startDate }));
    }
    const production = await service.list(
      ctx,
      parseInput(listProjectsQuerySchema, { status: "production", sort: "name" }),
    );
    expect(production.data.map((p) => p.name)).toEqual(["Bravo", "Charlie"]);

    const range = await service.list(
      ctx,
      parseInput(listProjectsQuerySchema, { startFrom: "2025-03-01", startTo: "2025-12-31" }),
    );
    expect(range.data.map((p) => p.name)).toEqual(["Bravo"]);

    const page2 = await service.list(
      ctx,
      parseInput(listProjectsQuerySchema, { sort: "name", page: "2", pageSize: "2" }),
    );
    expect(page2.data.map((p) => p.name)).toEqual(["Charlie"]);
    expect(page2.page).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
  });

  it("skills: unique per user (case-insensitive), level model validation, filters", async () => {
    const ctx = contextFor(await createTestUser("skill"));
    const service = createSkillService(db);
    const ts = await service.create(
      ctx,
      parseInput(createSkillSchema, { name: "TypeScript", category: "Languages", targetLevel: 4 }),
    );
    expect(ts).toMatchObject({
      targetLevel: 4,
      targetLevelLabel: "Advanced",
      levelModel: "peos-default-v1",
    });
    await expect(
      service.create(ctx, parseInput(createSkillSchema, { name: "  typescript " })),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(createSkillSchema.safeParse({ name: "Go", targetLevel: 7 }).success).toBe(false);

    await service.create(ctx, parseInput(createSkillSchema, { name: "Go", active: false }));
    const active = await service.list(ctx, parseInput(listSkillsQuerySchema, { active: "true" }));
    expect(active.data.map((s) => s.name)).toEqual(["TypeScript"]);
    expect(await service.categories(ctx)).toEqual(["Languages"]);

    // A second user may use the same skill name.
    const other = contextFor(await createTestUser("skill-b"));
    await expect(
      service.create(other, parseInput(createSkillSchema, { name: "TypeScript" })),
    ).resolves.toBeTruthy();
  });

  it("technologies, certifications, evidence, experience and education CRUD", async () => {
    const ctx = contextFor(await createTestUser("misc"));
    const tech = await createTechnologyService(db).create(
      ctx,
      parseInput(createTechnologySchema, { name: "PostgreSQL", version: "17" }),
    );
    expect(tech).toMatchObject({ name: "PostgreSQL", version: "17", projects: [] });
    const techs = await createTechnologyService(db).list(
      ctx,
      parseInput(listTechnologiesQuerySchema, {}),
    );
    expect(techs.data[0]?.counts.projects).toBe(0);

    const certs = createCertificationService(db);
    // Bypass the request schema to prove the service enforces date order itself.
    const cert = await certs
      .create(ctx, {
        ...parseInput(createCertificationSchema, {
          name: "Cloud Architect",
          issuer: "Example Issuer",
        }),
        issueDate: new Date("2025-01-01T00:00:00Z"),
        expiryDate: new Date("2020-01-01T00:00:00Z"),
      })
      .catch((e: unknown) => e);
    expect(cert).toMatchObject({ code: "VALIDATION_FAILED" });
    const valid = await certs.create(
      ctx,
      parseInput(createCertificationSchema, {
        name: "Cloud Architect",
        issuer: "Example Issuer",
        expiryDate: "2000-01-01",
      }),
    );
    expect(valid.expiryState).toBe("expired");
    const expired = await certs.list(
      ctx,
      parseInput(listCertificationsQuerySchema, { expiry: "expired" }),
    );
    expect(expired.page.total).toBe(1);

    const evidence = createEvidenceService(db);
    const e1 = await evidence.create(
      ctx,
      parseInput(createEvidenceSchema, { type: "repository", title: "Repo", verified: true }),
    );
    expect(e1.verified).toBe(true);
    expect(e1.verifiedAt).not.toBeNull();
    const e2 = await evidence.update(ctx, e1.id, { verified: false });
    expect(e2).toMatchObject({ verified: false, verifiedAt: null });
    const unverified = await evidence.list(
      ctx,
      parseInput(listEvidenceQuerySchema, { verified: "false" }),
    );
    expect(unverified.page.total).toBe(1);

    const exp = await createExperienceService(db).create(
      ctx,
      parseInput(createExperienceSchema, {
        organization: "Example Org",
        title: "Engineer",
        startDate: "2020-01-01",
        achievements: ["Shipped X"],
      }),
    );
    expect(exp).toMatchObject({ current: true, achievements: ["Shipped X"] });
    const current = await createExperienceService(db).list(
      ctx,
      parseInput(listExperiencesQuerySchema, { current: "true" }),
    );
    expect(current.page.total).toBe(1);
    expect(
      createExperienceSchema.safeParse({
        organization: "O",
        title: "T",
        startDate: "2020-01-01",
        endDate: "2019-01-01",
      }).success,
    ).toBe(false);

    const edu = await createEducationService(db).create(
      ctx,
      parseInput(createEducationSchema, { institution: "Example University", degree: "BSc" }),
    );
    expect(edu).toMatchObject({ institution: "Example University", startDate: null });
    const eduList = await createEducationService(db).list(
      ctx,
      parseInput(listEducationQuerySchema, { q: "university" }),
    );
    expect(eduList.page.total).toBe(1);
    await createEducationService(db).delete(ctx, edu.id);
    expect(
      (await createEducationService(db).list(ctx, parseInput(listEducationQuerySchema, {}))).page
        .total,
    ).toBe(0);
  });

  it("database CHECK constraints back the service rules", async () => {
    const user = await createTestUser("checks");
    await expect(
      db.project.create({ data: { userId: user.id, name: "Bad", slug: "Not A Slug" } }),
    ).rejects.toThrow(/projects_slug_format_chk/);
    await expect(
      db.skill.create({ data: { userId: user.id, name: "X", key: "Not Normalised" } }),
    ).rejects.toThrow(/skills_key_normalised_chk/);
    await expect(
      db.evidence.create({ data: { userId: user.id, type: "other", title: "E", verified: true } }),
    ).rejects.toThrow(/evidence_verified_at_chk/);
    await expect(
      db.experience.create({
        data: {
          userId: user.id,
          organization: "O",
          title: "T",
          startDate: new Date("2020-01-01"),
          endDate: new Date("2019-01-01"),
        },
      }),
    ).rejects.toThrow(/experiences_dates_chk/);
  });
});
