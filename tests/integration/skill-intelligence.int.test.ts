import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { metricHref, bucketHref } from "@/components/command-center/drilldown";
import { getDb } from "@/lib/db/client";
import { parseInput } from "@/lib/validation/parse";
import {
  careerGraphQuerySchema,
  createCareerGraphService,
} from "@/modules/analytics/career-graph.service";
import { dashboardFiltersSchema } from "@/modules/analytics/dashboard.schemas";
import { createDashboardService } from "@/modules/analytics/dashboard.service";
import {
  createSkillsAnalyticsService,
  skillsAnalyticsFiltersSchema,
} from "@/modules/analytics/skills-analytics.service";
import { createCertificationSchema } from "@/modules/certifications/certification.schemas";
import { createCertificationService } from "@/modules/certifications/certification.service";
import { createEvidenceSchema } from "@/modules/evidence/evidence.schemas";
import { createEvidenceService } from "@/modules/evidence/evidence.service";
import { createExperienceSchema } from "@/modules/experiences/experience.schemas";
import { createExperienceService } from "@/modules/experiences/experience.service";
import { createProjectSchema } from "@/modules/projects/project.schemas";
import { createProjectService } from "@/modules/projects/project.service";
import { toDateOnly } from "@/modules/shared/fields";
import { createLevelModelService } from "@/modules/skills/level-model.service";
import {
  createSkillIntelligenceService,
  skillIntelligenceQuerySchema,
} from "@/modules/skills/skill-intelligence.service";
import { createSkillSchema } from "@/modules/skills/skill.schemas";
import { createSkillService } from "@/modules/skills/skill.service";
import { createTechnologySchema } from "@/modules/technologies/technology.schemas";
import { createTechnologyService } from "@/modules/technologies/technology.service";

import { contextFor, createTestUser, truncateAll } from "./database";

/**
 * Phase 4 skill intelligence on real PostgreSQL. Synthetic fixtures, relative to today (UTC).
 * Every analytical number is asserted against its source records or its drill-down list.
 */
const db = getDb();
const DAY = 86_400_000;
const day = (o: number) => toDateOnly(new Date(Date.now() + o * DAY))!;
const skills = createSkillService(db);
const intel = createSkillIntelligenceService(db);
const analytics = createSkillsAnalyticsService(db);
type Ctx = ReturnType<typeof contextFor>;

const listTotal = async (ctx: Ctx, q: Record<string, string>) =>
  (await intel.list(ctx, parseInput(skillIntelligenceQuerySchema, q))).page.total;
const hrefQuery = (href: string) =>
  Object.fromEntries(new URL(href, "http://x").searchParams.entries());

beforeEach(() => truncateAll());
afterAll(() => db.$disconnect());

/** A known portfolio: one advanced skill, one target without evidence, one stale, one cert-only. */
async function seed(label: string) {
  const ctx = contextFor(await createTestUser(label));
  const ev = async (title: string, extra: Record<string, unknown>) =>
    createEvidenceService(db).create(
      ctx,
      parseInput(createEvidenceSchema, { type: "document", title, ...extra }),
    );
  const skill = async (name: string, extra: Record<string, unknown> = {}) =>
    skills.create(ctx, parseInput(createSkillSchema, { name, ...extra }));

  const ts = await skill(`${label} TypeScript`, { category: "Languages", targetLevel: 4 });
  const k8s = await skill(`${label} Kubernetes`, { category: "Platform", targetLevel: 4 });
  const cobol = await skill(`${label} COBOL`, { category: "Languages", targetLevel: 3 });
  const aws = await skill(`${label} AWS`, { category: "Platform" });
  const inactive = await skill(`${label} Flash`, { active: false, targetLevel: 5 });

  const e1 = await ev(`${label} TS design`, { date: day(-20), verified: true });
  const e2 = await ev(`${label} TS metrics`, {
    type: "production_metric",
    date: day(-400),
    verified: true,
  });
  const e3 = await ev(`${label} TS review`, { date: day(-100) });
  const e4 = await ev(`${label} TS undated`, {});
  const eOld = await ev(`${label} COBOL batch`, { date: day(-1200), verified: true });
  const eFuture = await ev(`${label} future talk`, { date: day(30) });

  await skills.replaceEvidence(ctx, ts.id, [
    { evidenceId: e1.id, strength: "strong", date: null },
    { evidenceId: e2.id, strength: "moderate", date: null },
    { evidenceId: e3.id, strength: "moderate", date: new Date(`${day(-5)}T00:00:00Z`) }, // link date overrides evidence date
    { evidenceId: e4.id, strength: "weak", date: null },
    { evidenceId: eFuture.id, strength: "weak", date: null },
  ]);
  await skills.replaceEvidence(ctx, cobol.id, [
    { evidenceId: eOld.id, strength: "moderate", date: null },
  ]);

  const tech = createTechnologyService(db);
  const node = await tech.create(
    ctx,
    parseInput(createTechnologySchema, { name: `${label} Node.js` }),
  );
  await skills.replaceTechnologies(ctx, ts.id, [node.id]);

  const project = await createProjectService(db).create(
    ctx,
    parseInput(createProjectSchema, {
      name: `${label} Platform`,
      status: "production",
      skillIds: [ts.id],
      technologies: [{ technologyId: node.id, usageType: "core" }],
      evidenceIds: [e1.id],
    }),
  );
  const certs = createCertificationService(db);
  const cert = await certs.create(
    ctx,
    parseInput(createCertificationSchema, { name: `${label} AWS SAA`, issuer: "AWS" }),
  );
  await certs.replaceSkills(ctx, cert.id, [aws.id]);
  const planned = await certs.create(
    ctx,
    parseInput(createCertificationSchema, {
      name: `${label} CKA`,
      issuer: "CNCF",
      status: "planned",
    }),
  );
  await certs.replaceSkills(ctx, planned.id, [k8s.id]);
  const exp = await createExperienceService(db).create(
    ctx,
    parseInput(createExperienceSchema, {
      organization: `${label} Corp`,
      title: "Engineer",
      startDate: day(-900),
    }),
  );
  await createExperienceService(db).replaceEvidence(ctx, exp.id, [e1.id]);
  return { ctx, ts, k8s, cobol, aws, inactive, node, project, cert, exp, e1, e3, e4, eFuture };
}

describe("evidence-derived skill intelligence (dossier)", () => {
  it("derives level 4 from real records and explains every input", async () => {
    const s = await seed("dos");
    const d = await intel.get(s.ctx, s.ts.id);
    // 5 links: qualifying 3 (strong e1, moderate e2, moderate e3), verified qualifying 2 (e1, e2),
    // strong 1, production-linked 2 (production project + production_metric), delivered project 1.
    expect(d.signals.evidence).toMatchObject({
      total: 5,
      qualifying: 3,
      qualifyingVerified: 2,
      strong: 1,
      productionMetric: 1,
    });
    expect(d.signals.projects).toEqual({ total: 1, delivered: 1, production: 1 });
    expect(d.derived).toMatchObject({ state: "derived", level: 4 });
    expect(d.row.current).toMatchObject({ level: 4, label: "Advanced" });
    expect(d.gap).toMatchObject({ state: "at_target", gap: 0, critical: false });
    expect(d.derived.nextLevel?.level).toBe(5);

    // Freshness: latest demonstration = link date (5 days ago) beats evidence dates; future ignored.
    expect(d.freshness).toMatchObject({ state: "fresh", latest: day(-5), daysSince: 5 });
    expect(d.signals.demonstrations).toMatchObject({ dated: 3, undated: 1, future: 1 });
    expect(d.evidence.items.find((i) => i.title === "dos TS review")?.demonstratedOn).toBe(day(-5));
    expect(d.evidence.items.find((i) => i.title === "dos future talk")?.future).toBe(true);

    expect(d.projects.map((p) => p.name)).toEqual(["dos Platform"]);
    expect(d.technologies.explicit.map((t) => t.name)).toEqual(["dos Node.js"]);
    expect(d.technologies.viaProjects).toEqual([
      { id: s.node.id, name: "dos Node.js", projects: 1 },
    ]);
    expect(d.experiences.map((x) => x.organization)).toEqual(["dos Corp"]);
    expect(d.yearly.reduce((n, y) => n + y.count, 0)).toBe(3);
  });

  it("missing evidence stays explicit: no level, no freshness, gap not computable, never critical", async () => {
    const s = await seed("miss");
    const k8s = await intel.get(s.ctx, s.k8s.id);
    // Only a planned certification is linked → records exist, but no level.
    expect(k8s.derived).toMatchObject({ state: "insufficient_evidence", level: null });
    expect(k8s.freshness).toMatchObject({ state: "no_evidence", latest: null, daysSince: null });
    expect(k8s.gap).toMatchObject({
      state: "not_computable",
      gap: null,
      critical: false,
      targetWithoutEvidence: true,
    });
    expect(k8s.trend.state).toBe("insufficient_history");

    const aws = await intel.get(s.ctx, s.aws.id);
    expect(aws.derived.level).toBe(2); // earned certification only → capped at 2
    expect(aws.gap.state).toBe("no_target");
    expect(aws.certifications.map((c) => c.status)).toEqual(["earned"]);

    const cobol = await intel.get(s.ctx, s.cobol.id);
    expect(cobol.freshness.state).toBe("stale");
    expect(cobol.gap).toMatchObject({ state: "below_target", gap: 1, critical: true }); // stale + below
  });

  it("returns 404 for a missing skill", async () => {
    const ctx = contextFor(await createTestUser("nf"));
    await expect(intel.get(ctx, crypto.randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("career analytics reconcile with the skill intelligence list", () => {
  it("every metric and bucket equals its drill-down list total", async () => {
    const s = await seed("rec");
    const sum = await analytics.summary(s.ctx, parseInput(skillsAnalyticsFiltersSchema, {}));
    const period = { from: null, to: null };

    // Coverage: active targets = TS, K8s, COBOL (3); fresh = TS (1).
    expect(sum.coverage).toMatchObject({ state: "ok", value: 1 / 3 });
    expect(await listTotal(s.ctx, hrefQuery(metricHref("skills.coverage", {}, period)!))).toBe(1);
    expect(await listTotal(s.ctx, { active: "true", hasTarget: "true" })).toBe(3);

    for (const [metric, value] of [
      ["skills.critical_gaps", sum.criticalGaps.value],
      ["skills.targets_without_evidence", sum.targetsWithoutEvidence.value],
      ["skills.production_evidence", sum.productionEvidence.value],
    ] as const) {
      expect(await listTotal(s.ctx, hrefQuery(metricHref(metric, {}, period)!)), metric).toBe(
        value,
      );
    }
    expect(sum.criticalGaps.value).toBe(1); // COBOL; the inactive skill is never critical
    expect(sum.targetsWithoutEvidence.value).toBe(1); // Kubernetes

    for (const m of [sum.freshness, sum.levels, sum.gaps, sum.trend]) {
      for (const b of m.breakdown!) {
        expect(
          await listTotal(s.ctx, hrefQuery(bucketHref(m.key, b.key, {})!)),
          `${m.key}:${b.key}`,
        ).toBe(b.value);
      }
      expect(
        m.breakdown!.reduce((n, b) => n + b.value, 0),
        m.key,
      ).toBe(sum.recordCounts.active);
    }

    // Radar: only skills with a derived level are plotted; never a 0 for missing data.
    expect(sum.radar.axes.map((a) => a.name)).toEqual(["rec TypeScript", "rec COBOL", "rec AWS"]);
    expect(sum.radar.axes.every((a) => a.current >= 1)).toBe(true);
    expect(sum.radar.omitted.withoutLevelNames.map((n) => n.name)).toEqual(["rec Kubernetes"]);
  });

  it("the category filter narrows every metric consistently", async () => {
    const s = await seed("cat");
    const sum = await analytics.summary(
      s.ctx,
      parseInput(skillsAnalyticsFiltersSchema, { category: "Platform" }),
    );
    expect(sum.recordCounts).toEqual({ skills: 2, active: 2 });
    expect(sum.filtersApplied).toEqual(["Category: Platform"]);
    expect(
      await listTotal(
        s.ctx,
        hrefQuery(
          metricHref(
            "skills.targets_without_evidence",
            { skillCategory: "Platform" },
            { from: null, to: null },
          )!,
        ),
      ),
    ).toBe(sum.targetsWithoutEvidence.value);
  });

  it("the Command Center shows the same coverage and critical gaps", async () => {
    const s = await seed("cc");
    const dash = await createDashboardService(db).dashboard(
      s.ctx,
      parseInput(dashboardFiltersSchema, {}),
    );
    const sum = await analytics.summary(s.ctx, parseInput(skillsAnalyticsFiltersSchema, {}));
    const kpi = (key: string) => dash.kpis.find((k) => k.key === key);
    expect(kpi("skills.coverage")?.value).toBe(sum.coverage.value);
    expect(kpi("skills.critical_gaps")?.value).toBe(sum.criticalGaps.value);
  });

  it("an empty account gets no-data states, not zeros", async () => {
    const ctx = contextFor(await createTestUser("empty"));
    const sum = await analytics.summary(ctx, parseInput(skillsAnalyticsFiltersSchema, {}));
    expect(sum.coverage).toMatchObject({ state: "no_data", value: null });
    expect(sum.criticalGaps).toMatchObject({ state: "no_data", value: null });
    expect(sum.radar.axes).toEqual([]);
    const withSkill = await skills.create(ctx, parseInput(createSkillSchema, { name: "Lonely" }));
    expect(withSkill.id).toBeTruthy();
    const again = await analytics.summary(ctx, parseInput(skillsAnalyticsFiltersSchema, {}));
    expect(again.coverage).toMatchObject({ state: "insufficient_data", value: null });
  });

  it("list pagination and sorting are bounded and deterministic", async () => {
    const s = await seed("pg");
    const p1 = await intel.list(
      s.ctx,
      parseInput(skillIntelligenceQuerySchema, { pageSize: "2", sort: "name" }),
    );
    const p2 = await intel.list(
      s.ctx,
      parseInput(skillIntelligenceQuerySchema, { pageSize: "2", page: "2", sort: "name" }),
    );
    expect(p1.page.total).toBe(5);
    expect([...p1.data, ...p2.data].map((r) => r.name)).toEqual([
      "pg AWS",
      "pg COBOL",
      "pg Flash",
      "pg Kubernetes",
    ]);
    expect(() => parseInput(skillIntelligenceQuerySchema, { pageSize: "500" })).toThrow();
  });
});

describe("custom level models and explicit technology links", () => {
  it("custom labels apply, are owner-bound, audited, and cannot be deleted while used", async () => {
    const s = await seed("lm");
    const models = createLevelModelService(db);
    const levels = [0, 1, 2, 3, 4, 5].map((value) => ({
      value,
      label: `Tier ${value}`,
      description: null,
    }));
    const model = await models.create(s.ctx, { name: "Tiers", levels });
    await skills.update(s.ctx, s.ts.id, { levelModelId: model.id });
    const d = await intel.get(s.ctx, s.ts.id);
    expect(d.row.current).toMatchObject({ level: 4, label: "Tier 4" });
    expect(d.levelModel.name).toBe("Tiers");

    await expect(models.delete(s.ctx, model.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await skills.update(s.ctx, s.ts.id, { levelModelId: null });
    await models.delete(s.ctx, model.id);

    const other = contextFor(await createTestUser("lm-other"));
    const foreign = await models.create(other, { name: "Theirs", levels });
    await expect(skills.update(s.ctx, s.ts.id, { levelModelId: foreign.id })).rejects.toMatchObject(
      {
        code: "VALIDATION_FAILED",
      },
    );
    // The database itself rejects a skill pointing at another owner's model.
    await expect(
      db.skill.update({
        where: { id: s.ts.id },
        data: { levelModel: "custom", levelModelId: foreign.id },
      }),
    ).rejects.toThrow();
    // …and an inconsistent model marker.
    await expect(
      db.skill.update({
        where: { id: s.ts.id },
        data: { levelModel: "custom", levelModelId: null },
      }),
    ).rejects.toThrow(/skills_level_model_chk/);

    const actions = (
      await db.auditLog.findMany({
        where: { actorId: s.ctx.userId, entityType: "skill_level_model" },
        orderBy: { createdAt: "asc" },
      })
    ).map((a) => a.action);
    expect(actions).toEqual(["skill_level_model.created", "skill_level_model.deleted"]);
  });

  it("technology links are replace-set, owner-checked and audited", async () => {
    const s = await seed("tl");
    const other = contextFor(await createTestUser("tl-other"));
    const foreign = await createTechnologyService(db).create(
      other,
      parseInput(createTechnologySchema, { name: "Foreign" }),
    );
    await expect(skills.replaceTechnologies(s.ctx, s.ts.id, [foreign.id])).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(
      db.technologySkill.create({
        data: { userId: s.ctx.userId, technologyId: foreign.id, skillId: s.ts.id },
      }),
    ).rejects.toThrow();
    await skills.replaceTechnologies(s.ctx, s.ts.id, []);
    expect(await db.technologySkill.count({ where: { skillId: s.ts.id } })).toBe(0);
    const audit = await db.auditLog.findFirst({
      where: { actorId: s.ctx.userId, action: "skill.relations_updated" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.after).toEqual({ technologyIds: [] });
  });
});

describe("career graph", () => {
  it("contains only real records and real relationships, bounded and deterministic", async () => {
    const s = await seed("cg");
    const graph = createCareerGraphService(db);
    const g = (await graph.graph(s.ctx, parseInput(careerGraphQuerySchema, {}))).data;
    expect(g.mode).toBe("overview");
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const e of g.edges) {
      expect(ids.has(e.source) && ids.has(e.target), `${e.source}->${e.target}`).toBe(true);
    }
    // Each edge corresponds to a persisted join row.
    const hasEdge = (a: string, b: string) => g.edges.some((e) => e.source === a && e.target === b);
    expect(hasEdge(`project:${s.project.id}`, `skill:${s.ts.id}`)).toBe(true);
    expect(hasEdge(`project:${s.project.id}`, `technology:${s.node.id}`)).toBe(true);
    expect(hasEdge(`technology:${s.node.id}`, `skill:${s.ts.id}`)).toBe(true);
    expect(hasEdge(`certification:${s.cert.id}`, `skill:${s.aws.id}`)).toBe(true);
    expect(g.edges).toHaveLength(
      (await db.projectSkill.count({ where: { userId: s.ctx.userId } })) +
        (await db.technologyUsage.count({ where: { userId: s.ctx.userId } })) +
        (await db.technologySkill.count({ where: { userId: s.ctx.userId } })) +
        (await db.certificationSkill.count({ where: { userId: s.ctx.userId } })),
    );
    expect(g.nodes.find((n) => n.id === `skill:${s.inactive.id}`)).toBeUndefined();
    const again = (await graph.graph(s.ctx, parseInput(careerGraphQuerySchema, {}))).data;
    expect(again).toEqual(g);

    // Focus mode on evidence e1: its skill, project and experience (types enabled explicitly).
    const focus = (
      await graph.graph(
        s.ctx,
        parseInput(careerGraphQuerySchema, {
          focusType: "evidence",
          focusId: s.e1.id,
          types: "skill,project,experience,evidence",
        }),
      )
    ).data;
    expect(focus.nodes[0]).toMatchObject({
      id: `evidence:${s.e1.id}`,
      focus: true,
      href: `/evidence/${s.e1.id}`,
    });
    expect(focus.nodes.map((n) => n.type).sort()).toEqual([
      "evidence",
      "experience",
      "project",
      "skill",
    ]);

    // Bounded.
    const small = (await graph.graph(s.ctx, parseInput(careerGraphQuerySchema, { limit: "10" })))
      .data;
    expect(small.nodes.length).toBeLessThanOrEqual(10);
    await expect(
      graph.graph(
        s.ctx,
        parseInput(careerGraphQuerySchema, { focusType: "skill", focusId: crypto.randomUUID() }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(() => parseInput(careerGraphQuerySchema, { types: "skill,goal" })).toThrow();
    expect(() => parseInput(careerGraphQuerySchema, { limit: "1000" })).toThrow();
  });
});
