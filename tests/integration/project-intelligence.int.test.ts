import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getDb } from "@/lib/db/client";
import { parseInput } from "@/lib/validation/parse";
import { createActivityService } from "@/modules/analytics/activity.service";
import {
  COMPUTED_BUCKETS,
  createPortfolioService,
  healthListQuerySchema,
  portfolioFiltersSchema,
} from "@/modules/analytics/portfolio.service";
import { createEvidenceSchema, listEvidenceQuerySchema } from "@/modules/evidence/evidence.schemas";
import { createEvidenceService } from "@/modules/evidence/evidence.service";
import {
  createMilestoneSchema,
  listMilestonesQuerySchema,
} from "@/modules/milestones/milestone.schemas";
import { createMilestoneService } from "@/modules/milestones/milestone.service";
import { createProjectIntelligenceService } from "@/modules/projects/project-intelligence";
import { LIFECYCLE_ORDER } from "@/modules/projects/project.lifecycle";
import { createProjectSchema, listProjectsQuerySchema } from "@/modules/projects/project.schemas";
import { createProjectService } from "@/modules/projects/project.service";
import { toDateOnly } from "@/modules/shared/fields";
import { createSkillSchema } from "@/modules/skills/skill.schemas";
import { createSkillService } from "@/modules/skills/skill.service";
import { createTechnologySchema } from "@/modules/technologies/technology.schemas";
import { createTechnologyService } from "@/modules/technologies/technology.service";

import { contextFor, createTestUser, truncateAll } from "./database";

/**
 * Phase 3 project intelligence on real PostgreSQL. Fixtures are synthetic and relative to today
 * (UTC), so overdue/schedule rules are deterministic for any run date.
 */
const db = getDb();
const DAY = 86_400_000;
const day = (offset: number) => toDateOnly(new Date(Date.now() + offset * DAY))!;
const projects = createProjectService(db);
const milestones = createMilestoneService(db);
const intelligence = createProjectIntelligenceService(db);
const portfolio = createPortfolioService(db);
const evidence = createEvidenceService(db);

type Ctx = ReturnType<typeof contextFor>;
const project = (ctx: Ctx, input: Record<string, unknown>) =>
  projects.create(ctx, parseInput(createProjectSchema, input));
const milestone = (ctx: Ctx, projectId: string, input: Record<string, unknown>) =>
  milestones.create(ctx, projectId, parseInput(createMilestoneSchema, input));
const listTotal = async (ctx: Ctx, q: Record<string, string>) =>
  (await milestones.list(ctx, parseInput(listMilestonesQuerySchema, q))).page.total;
const projectTotal = async (ctx: Ctx, q: Record<string, string>) =>
  (await projects.list(ctx, parseInput(listProjectsQuerySchema, q))).page.total;
const value = (m: { value: number | null }) => m.value ?? 0;

beforeEach(() => truncateAll());
afterAll(() => db.$disconnect());

describe("milestones: lifecycle, persistence and audit", () => {
  it("create → edit → complete → reopen → cancel → delete, each audited in order", async () => {
    const ctx = contextFor(await createTestUser("ms"));
    const p = await project(ctx, { name: "Fixture Platform", status: "development" });
    const m = await milestone(ctx, p.id, { title: "Design review", dueDate: day(10) });
    expect(m).toMatchObject({
      status: "planned",
      completedAt: null,
      overdue: false,
      projectId: p.id,
    });

    await milestones.update(
      ctx,
      m.id,
      parseInput(createMilestoneSchema.partial(), { title: "Design sign-off" }),
    );
    const done = await milestones.update(ctx, m.id, { status: "completed" });
    expect(done).toMatchObject({ status: "completed", completedAt: day(0) });
    const reopened = await milestones.update(ctx, m.id, { status: "in_progress" });
    expect(reopened).toMatchObject({ status: "in_progress", completedAt: null });
    await milestones.update(ctx, m.id, { status: "cancelled" });
    await milestones.delete(ctx, m.id);
    await expect(milestones.get(ctx, m.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    const actions = (
      await db.auditLog.findMany({
        where: { actorId: ctx.userId, entityType: "milestone" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })
    ).map((a) => a.action);
    expect(actions).toEqual([
      "milestone.created",
      "milestone.updated",
      "milestone.completed",
      "milestone.reopened",
      "milestone.updated",
      "milestone.deleted",
    ]);
    const deleted = await db.auditLog.findFirst({ where: { action: "milestone.deleted" } });
    expect(deleted?.before).toMatchObject({ title: "Design sign-off", projectId: p.id });
    expect(JSON.stringify(deleted?.before)).not.toContain(ctx.userId);
  });

  it("the database enforces completed ⇔ completion date and the owner–project link", async () => {
    const ctx = contextFor(await createTestUser("chk"));
    const other = contextFor(await createTestUser("other"));
    const p = await project(ctx, { name: "Fixture" });
    await expect(
      db.milestone.create({
        data: { userId: ctx.userId, projectId: p.id, title: "x", status: "completed" },
      }),
    ).rejects.toThrow(/milestones_completion_chk/);
    await expect(
      db.milestone.create({
        data: { userId: ctx.userId, projectId: p.id, title: "x", completedAt: new Date() },
      }),
    ).rejects.toThrow(/milestones_completion_chk/);
    // Another owner's milestone can never reference this project (composite FK).
    await expect(
      db.milestone.create({ data: { userId: other.userId, projectId: p.id, title: "x" } }),
    ).rejects.toThrow();
    // Deleting the project removes its milestones.
    await milestone(ctx, p.id, { title: "Kept until project deletion" });
    await projects.delete(ctx, p.id);
    expect(await db.milestone.count({ where: { userId: ctx.userId } })).toBe(0);
  });

  it("rejects inconsistent completion input with field errors", async () => {
    const ctx = contextFor(await createTestUser("val"));
    const p = await project(ctx, { name: "Fixture" });
    await expect(
      milestone(ctx, p.id, { title: "x", status: "completed", completedAt: day(2) }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      milestone(ctx, p.id, { title: "x", status: "planned", completedAt: day(-2) }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(milestone(ctx, crypto.randomUUID(), { title: "x" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

/** A small, fully known portfolio. */
async function seedPortfolio(label: string) {
  const ctx = contextFor(await createTestUser(label));
  const tech = createTechnologyService(db);
  const ts = await tech.create(
    ctx,
    parseInput(createTechnologySchema, { name: `${label} TypeScript` }),
  );
  const pg = await tech.create(
    ctx,
    parseInput(createTechnologySchema, { name: `${label} PostgreSQL` }),
  );
  const skill = await createSkillService(db).create(
    ctx,
    parseInput(createSkillSchema, { name: `${label} Distributed systems` }),
  );
  const ev = async (title: string, extra: Record<string, unknown>) =>
    evidence.create(ctx, parseInput(createEvidenceSchema, { type: "document", title, ...extra }));
  const e1 = await ev(`${label} design doc`, { date: day(-20), verified: true });
  const e2 = await ev(`${label} demo`, { date: day(-5) });
  const e3 = await ev(`${label} undated note`, {});
  await createSkillService(db).replaceEvidence(ctx, skill.id, [
    { evidenceId: e1.id, strength: "strong", date: null },
  ]);

  const core = await project(ctx, {
    name: `${label} Core`,
    status: "development",
    healthStatus: "on_track",
    startDate: day(-200),
    targetDate: day(60),
    technologies: [
      { technologyId: ts.id, usageType: "core" },
      { technologyId: pg.id, usageType: "infrastructure" },
    ],
    evidenceIds: [e1.id, e2.id, e3.id],
  });
  const shipped = await project(ctx, {
    name: `${label} Shipped`,
    status: "production",
    healthStatus: "at_risk",
    startDate: day(-300),
    targetDate: day(-120),
    completedAt: day(-100),
    technologies: [{ technologyId: ts.id, usageType: "supporting" }],
  });
  const old = await project(ctx, { name: `${label} Old`, status: "archived" });
  const idea = await project(ctx, { name: `${label} Idea`, status: "idea" });

  await milestone(ctx, core.id, {
    title: "M1",
    dueDate: day(-30),
    status: "completed",
    completedAt: day(-31),
  });
  await milestone(ctx, core.id, {
    title: "M2",
    dueDate: day(-10),
    status: "completed",
    completedAt: day(-3),
  });
  await milestone(ctx, core.id, { title: "M3 overdue", dueDate: day(-1) });
  await milestone(ctx, core.id, { title: "M4 due today", dueDate: day(0) });
  await milestone(ctx, core.id, { title: "M5 blocked", dueDate: day(20), status: "blocked" });
  await milestone(ctx, core.id, { title: "M6 undated" });
  await milestone(ctx, core.id, { title: "M7 cancelled", dueDate: day(-40), status: "cancelled" });
  await milestone(ctx, shipped.id, {
    title: "S1",
    dueDate: day(-130),
    status: "completed",
    completedAt: day(-125),
  });
  await milestone(ctx, old.id, { title: "Abandoned", dueDate: day(-400) });
  return { ctx, core, shipped, old, idea, ts, pg, skill, e1, e2, e3 };
}

describe("project intelligence (dossier)", () => {
  it("computes lifecycle, schedule, delivery, health, evidence and technologies from real records", async () => {
    const s = await seedPortfolio("dos");
    const intel = await intelligence.get(s.ctx, s.core.id);

    expect(intel.lifecycle).toMatchObject({
      status: "development",
      position: 4,
      group: "active",
      historyRecorded: false,
    });
    expect(intel.schedule).toMatchObject({
      targetDate: day(60),
      daysToTarget: 60,
      completedAt: null,
    });

    expect(intel.milestones.byStatus).toEqual({
      planned: 3,
      in_progress: 0,
      blocked: 1,
      completed: 2,
      cancelled: 1,
    });
    expect(value(intel.milestones.total)).toBe(7);
    expect(value(intel.milestones.completed)).toBe(2);
    expect(value(intel.milestones.overdue)).toBe(1); // M3 only: M4 is due today, M7 cancelled
    expect(value(intel.milestones.blocked)).toBe(1);
    expect(intel.milestones.deliveryRate).toMatchObject({ state: "ok", value: 2 / 3 });

    expect(intel.health.manual).toBe("on_track");
    const c = Object.fromEntries(intel.health.computed.components.map((x) => [x.key, x]));
    expect(c.schedule).toMatchObject({ state: "scored", score: 100 });
    expect(c.milestones).toMatchObject({ state: "scored", score: 67 });
    expect(c.blockers).toMatchObject({ state: "scored", score: 0 });
    expect(c.recent_activity).toMatchObject({ state: "scored", score: 100 });
    expect(c.scope_stability!.state).toBe("unavailable");
    expect(c.issue_severity!.state).toBe("unavailable");
    expect(intel.health.computed).toMatchObject({ status: "partial", score: 67, band: "watch" });

    expect(value(intel.evidence.total)).toBe(3);
    expect(value(intel.evidence.verified)).toBe(1);
    expect(intel.evidence).toMatchObject({
      dated: 2,
      undated: 1,
      byOrigin: { manual: 3, import: 0 },
    });
    expect(intel.evidence.timeline.map((e) => e.title)).toEqual(["dos demo", "dos design doc"]);
    expect(intel.evidence.relatedSkills).toEqual([
      { id: s.skill.id, name: "dos Distributed systems", evidenceCount: 1 },
    ]);
    expect(intel.technologies.map((t) => [t.name, t.usageType, t.otherProjects])).toEqual([
      ["dos PostgreSQL", "infrastructure", 0],
      ["dos TypeScript", "core", 1],
    ]);

    // Evidence drill-down: the dossier counts equal the filtered evidence list.
    const evTotal = async (q: Record<string, string>) =>
      (await evidence.list(s.ctx, parseInput(listEvidenceQuerySchema, q))).page.total;
    expect(await evTotal({ projectId: s.core.id })).toBe(3);
    expect(await evTotal({ projectId: s.core.id, verified: "true" })).toBe(1);
    expect(await listTotal(s.ctx, { projectId: s.core.id })).toBe(7);
    expect(await listTotal(s.ctx, { projectId: s.core.id, overdue: "true" })).toBe(1);
    expect(await listTotal(s.ctx, { projectId: s.core.id, status: "blocked" })).toBe(1);
  });

  it("an empty project gets explicit no-data states — no fabricated zeros or health", async () => {
    const ctx = contextFor(await createTestUser("empty"));
    const p = await project(ctx, { name: "Fixture Empty", status: "development" });
    const intel = await intelligence.get(ctx, p.id);
    expect(intel.milestones.total).toMatchObject({ state: "no_data", value: null });
    expect(intel.milestones.deliveryRate).toMatchObject({ state: "no_data", value: null });
    expect(intel.evidence.total).toMatchObject({ state: "no_data", value: null });
    expect(intel.technologies).toEqual([]);
    // schedule insufficient, milestones/blockers insufficient, activity scored (creation event) → 1 scored
    expect(intel.health.computed).toMatchObject({
      status: "insufficient_data",
      score: null,
      band: null,
    });
  });

  it("delivery rate is insufficient (not 0%) when no milestone is completed or overdue", async () => {
    const ctx = contextFor(await createTestUser("future"));
    const p = await project(ctx, { name: "Fixture Future" });
    await milestone(ctx, p.id, { title: "Later", dueDate: day(30) });
    const intel = await intelligence.get(ctx, p.id);
    expect(intel.milestones.deliveryRate).toMatchObject({
      state: "insufficient_data",
      value: null,
      stateReason: expect.stringContaining("No milestone is completed or past"),
    });
  });

  it("never changes the manual health status", async () => {
    const s = await seedPortfolio("manual");
    await intelligence.get(s.ctx, s.core.id);
    await portfolio.portfolio(s.ctx, parseInput(portfolioFiltersSchema, {}));
    expect((await projects.get(s.ctx, s.core.id)).healthStatus).toBe("on_track");
    expect((await projects.get(s.ctx, s.shipped.id)).healthStatus).toBe("at_risk");
  });

  it("project activity covers the project and its milestones (deleted ones too), safely", async () => {
    const s = await seedPortfolio("act");
    const m = await milestone(s.ctx, s.core.id, { title: "Temporary" });
    await milestones.delete(s.ctx, m.id);
    const activity = await createActivityService(db).listForProject(s.ctx, s.core.id, {
      page: 1,
      pageSize: 50,
    });
    const items = activity.data;
    expect(
      items.some((i) => i.summary === "Deleted milestone" && i.label === "Temporary" && i.deleted),
    ).toBe(true);
    expect(items.some((i) => i.summary === "Created project" && i.label === "act Core")).toBe(true);
    expect(items.every((i) => !i.label?.startsWith("S1"))).toBe(true); // other project's milestone
    expect(items.find((i) => i.label === "M3 overdue")?.href).toBe(
      `/projects/${s.core.id}#milestones`,
    );
    expect(JSON.stringify(activity)).not.toMatch(/"before"|"after"|userId/);
  });
});

describe("portfolio analytics: every value equals its drill-down source list", () => {
  it("milestones, lifecycle, technologies, evidence coverage, trends and computed health", async () => {
    const s = await seedPortfolio("pf");
    const ctx = s.ctx;
    const p = await portfolio.portfolio(ctx, parseInput(portfolioFiltersSchema, { range: "365d" }));

    // Milestones (overdue excludes the archived project's abandoned milestone).
    expect(value(p.milestones.total)).toBe(9);
    expect(value(p.milestones.overdue)).toBe(1);
    expect(p.milestones.deliveryRate.value).toBeCloseTo(3 / 4);
    expect(await listTotal(ctx, {})).toBe(value(p.milestones.total));
    expect(await listTotal(ctx, { overdue: "true" })).toBe(value(p.milestones.overdue));
    expect(await listTotal(ctx, { status: "blocked" })).toBe(value(p.milestones.blocked));
    expect(await listTotal(ctx, { status: "completed" })).toBe(3);
    expect(await listTotal(ctx, { completedFrom: p.period.from!, completedTo: p.period.to! })).toBe(
      value(p.milestones.completedInPeriod),
    );
    expect(p.milestones.trend.breakdown!.reduce((n, b) => n + b.value, 0)).toBe(
      value(p.milestones.completedInPeriod),
    );

    // Lifecycle buckets, canonical order, zeros included.
    expect(p.lifecycle.breakdown!.map((b) => b.key)).toEqual([...LIFECYCLE_ORDER]);
    for (const bucket of p.lifecycle.breakdown!) {
      expect(await projectTotal(ctx, { status: bucket.key }), bucket.key).toBe(bucket.value);
    }

    // Delivery trend: projects completed in the period.
    const trendTotal = p.deliveryTrend.breakdown!.reduce((n, b) => n + b.value, 0);
    expect(trendTotal).toBe(1);
    expect(
      await projectTotal(ctx, { completedFrom: p.period.from!, completedTo: p.period.to! }),
    ).toBe(trendTotal);

    // Technology usage = projects filtered by technology.
    expect(p.technologies.rows.map((t) => [t.name, t.total])).toEqual([
      ["pf TypeScript", 2],
      ["pf PostgreSQL", 1],
    ]);
    for (const t of p.technologies.rows) {
      expect(await projectTotal(ctx, { technologyId: t.id })).toBe(t.total);
    }

    // Evidence coverage.
    for (const bucket of p.evidenceCoverage.breakdown!) {
      expect(await projectTotal(ctx, { hasEvidence: bucket.key })).toBe(bucket.value);
    }

    // Computed health distribution = computed-health list totals; archived is not assessed.
    const computed = Object.fromEntries(p.computedHealth.breakdown!.map((b) => [b.key, b.value]));
    expect(computed.not_applicable).toBe(1);
    for (const bucket of COMPUTED_BUCKETS) {
      const list = await portfolio.healthList(
        ctx,
        parseInput(healthListQuerySchema, { computed: bucket }),
      );
      expect(list.page.total, bucket).toBe(computed[bucket]);
    }
    // Manual × computed matrix = list filtered by both.
    for (const cell of p.healthComparison.breakdown!.filter((b) => b.value > 0)) {
      const [manual, bucket] = cell.key.split("|");
      const list = await portfolio.healthList(
        ctx,
        parseInput(healthListQuerySchema, { manual, computed: bucket }),
      );
      expect(list.page.total, cell.key).toBe(cell.value);
    }
    expect(p.attention.overdueMilestones.map((m) => m.title)).toEqual(["M3 overdue"]);
  });

  it("an empty account gets no-data states and no fabricated portfolio", async () => {
    const ctx = contextFor(await createTestUser("none"));
    const p = await portfolio.portfolio(ctx, parseInput(portfolioFiltersSchema, {}));
    expect(p.recordCounts).toEqual({ projects: 0, milestones: 0 });
    expect(p.lifecycle.state).toBe("no_data");
    expect(p.milestones.deliveryRate).toMatchObject({ state: "no_data", value: null });
    expect(p.technologies.rows).toEqual([]);
    expect(p.deliveryTrend.breakdown!.every((b) => b.value === 0)).toBe(true);
  });
});
