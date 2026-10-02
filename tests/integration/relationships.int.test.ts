import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getDb } from "@/lib/db/client";
import { parseInput } from "@/lib/validation/parse";
import { createCertificationSchema } from "@/modules/certifications/certification.schemas";
import { createCertificationService } from "@/modules/certifications/certification.service";
import { createEvidenceSchema } from "@/modules/evidence/evidence.schemas";
import { createEvidenceService } from "@/modules/evidence/evidence.service";
import { createExperienceSchema } from "@/modules/experiences/experience.schemas";
import { createExperienceService } from "@/modules/experiences/experience.service";
import { createProjectSchema, listProjectsQuerySchema } from "@/modules/projects/project.schemas";
import { createProjectService } from "@/modules/projects/project.service";
import { createSkillSchema } from "@/modules/skills/skill.schemas";
import { createSkillService } from "@/modules/skills/skill.service";
import { createTechnologySchema } from "@/modules/technologies/technology.schemas";
import { createTechnologyService } from "@/modules/technologies/technology.service";

import { contextFor, createTestUser, truncateAll } from "./database";

const db = getDb();
const projects = createProjectService(db);
const skills = createSkillService(db);
const techs = createTechnologyService(db);
const evidence = createEvidenceService(db);
const certs = createCertificationService(db);
const experiences = createExperienceService(db);

async function seed(label: string) {
  const ctx = contextFor(await createTestUser(label));
  const skill = await skills.create(ctx, parseInput(createSkillSchema, { name: `Skill ${label}` }));
  const tech = await techs.create(
    ctx,
    parseInput(createTechnologySchema, { name: `Tech ${label}` }),
  );
  const ev = await evidence.create(
    ctx,
    parseInput(createEvidenceSchema, { type: "document", title: `Doc ${label}` }),
  );
  return { ctx, skill, tech, ev };
}

describe("Phase 1 relationships", () => {
  beforeEach(truncateAll);
  afterAll(() => db.$disconnect());

  it("creates a project with relationships atomically and navigates both directions", async () => {
    const { ctx, skill, tech, ev } = await seed("a");
    const project = await projects.create(
      ctx,
      parseInput(createProjectSchema, {
        name: "Linked",
        skillIds: [skill.id],
        technologies: [
          { technologyId: tech.id, usageType: "infrastructure", proficiencyEvidence: "Ran it" },
        ],
        evidenceIds: [ev.id],
      }),
    );
    expect(project.skills.map((s) => s.id)).toEqual([skill.id]);
    expect(project.technologies[0]).toMatchObject({
      id: tech.id,
      usageType: "infrastructure",
      proficiencyEvidence: "Ran it",
    });
    expect(project.evidence.map((e) => e.id)).toEqual([ev.id]);

    expect((await skills.get(ctx, skill.id)).projects.map((p) => p.id)).toEqual([project.id]);
    expect((await techs.get(ctx, tech.id)).projects[0]).toMatchObject({
      id: project.id,
      usageType: "infrastructure",
    });
    expect((await evidence.get(ctx, ev.id)).projects.map((p) => p.id)).toEqual([project.id]);

    const bySkill = await projects.list(
      ctx,
      parseInput(listProjectsQuerySchema, { skillId: skill.id }),
    );
    expect(bySkill.data.map((p) => p.id)).toEqual([project.id]);
    const byTech = await projects.list(
      ctx,
      parseInput(listProjectsQuerySchema, { technologyId: tech.id }),
    );
    expect(byTech.data[0]?.counts).toEqual({ skills: 1, technologies: 1, evidence: 1 });
  });

  it("rolls back the whole create when any related id is foreign or missing", async () => {
    const a = await seed("a");
    const b = await seed("b");
    await expect(
      projects.create(
        a.ctx,
        parseInput(createProjectSchema, {
          name: "Should not exist",
          skillIds: [a.skill.id, b.skill.id],
        }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await db.project.count({ where: { userId: a.ctx.userId } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: "project.created" } })).toBe(0);
  });

  it("replace-set updates are idempotent and audited with before/after", async () => {
    const { ctx, skill, ev } = await seed("a");
    const second = await skills.create(ctx, parseInput(createSkillSchema, { name: "Second" }));
    const project = await projects.create(ctx, parseInput(createProjectSchema, { name: "P" }));

    await projects.replaceSkills(ctx, project.id, [skill.id, second.id]);
    const once = await projects.replaceSkills(ctx, project.id, [second.id]);
    expect(once.skills.map((s) => s.id)).toEqual([second.id]);
    await projects.replaceEvidence(ctx, project.id, [ev.id]);
    const cleared = await projects.replaceEvidence(ctx, project.id, []);
    expect(cleared.evidence).toEqual([]);

    const audit = await db.auditLog.findMany({
      where: { entityId: project.id, action: "project.relations_updated" },
      orderBy: { createdAt: "asc" },
    });
    expect(audit).toHaveLength(4);
    expect(audit[1]?.before).toMatchObject({
      skillIds: expect.arrayContaining([skill.id, second.id]),
    });
    expect(audit[1]?.after).toMatchObject({ skillIds: [second.id] });
  });

  it("skill ↔ evidence carries strength and date", async () => {
    const { ctx, skill, ev } = await seed("a");
    const updated = await skills.replaceEvidence(ctx, skill.id, [
      { evidenceId: ev.id, strength: "strong", date: new Date("2026-02-01T00:00:00Z") },
    ]);
    expect(updated.evidence[0]).toMatchObject({
      id: ev.id,
      strength: "strong",
      linkDate: "2026-02-01",
    });
    expect((await evidence.get(ctx, ev.id)).skills[0]).toMatchObject({
      id: skill.id,
      strength: "strong",
    });
  });

  it("certification ↔ skill/evidence and experience ↔ evidence", async () => {
    const { ctx, skill, ev } = await seed("a");
    const cert = await certs.create(
      ctx,
      parseInput(createCertificationSchema, { name: "Cert", issuer: "Issuer" }),
    );
    await certs.replaceSkills(ctx, cert.id, [skill.id]);
    const withEvidence = await certs.replaceEvidence(ctx, cert.id, [ev.id]);
    expect(withEvidence.skills.map((s) => s.id)).toEqual([skill.id]);
    expect(withEvidence.evidence.map((e) => e.id)).toEqual([ev.id]);
    expect((await skills.get(ctx, skill.id)).certifications.map((c) => c.id)).toEqual([cert.id]);

    const exp = await experiences.create(
      ctx,
      parseInput(createExperienceSchema, {
        organization: "Org",
        title: "Role",
        startDate: "2021-01-01",
      }),
    );
    const linked = await experiences.replaceEvidence(ctx, exp.id, [ev.id]);
    expect(linked.evidence.map((e) => e.id)).toEqual([ev.id]);
    expect((await evidence.get(ctx, ev.id)).experiences.map((e) => e.id)).toEqual([exp.id]);
  });

  it("deleting a record cascades its relationship rows only", async () => {
    const { ctx, skill, tech, ev } = await seed("a");
    const project = await projects.create(
      ctx,
      parseInput(createProjectSchema, {
        name: "P",
        skillIds: [skill.id],
        technologies: [{ technologyId: tech.id }],
        evidenceIds: [ev.id],
      }),
    );
    await skills.delete(ctx, skill.id);
    const after = await projects.get(ctx, project.id);
    expect(after.skills).toEqual([]);
    expect(after.technologies).toHaveLength(1);

    await projects.delete(ctx, project.id);
    expect(await db.technologyUsage.count()).toBe(0);
    expect(await db.projectEvidence.count()).toBe(0);
    expect(await db.evidence.count({ where: { id: ev.id } })).toBe(1);
  });

  it("composite foreign keys reject cross-user links even when the service is bypassed", async () => {
    const a = await seed("a");
    const b = await seed("b");
    const project = await projects.create(a.ctx, parseInput(createProjectSchema, { name: "P" }));
    await expect(
      db.projectSkill.create({
        data: { userId: a.ctx.userId, projectId: project.id, skillId: b.skill.id },
      }),
    ).rejects.toThrow();
    await expect(
      db.projectSkill.create({
        data: { userId: b.ctx.userId, projectId: project.id, skillId: b.skill.id },
      }),
    ).rejects.toThrow();
    expect(await db.projectSkill.count()).toBe(0);
  });
});
