import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { bucketHref, metricHref } from "@/components/command-center/drilldown";
import { getDb } from "@/lib/db/client";
import { parseInput } from "@/lib/validation/parse";
import { dashboardFiltersSchema } from "@/modules/analytics/dashboard.schemas";
import { createDashboardService } from "@/modules/analytics/dashboard.service";
import { createGoalsAnalyticsService } from "@/modules/analytics/goals-analytics.service";
import { createEvidenceSchema } from "@/modules/evidence/evidence.schemas";
import { createEvidenceService } from "@/modules/evidence/evidence.service";
import { createGoalIntelligenceService } from "@/modules/goals/goal-intelligence";
import {
  createGoalSchema,
  createMeasurementSchema,
  listGoalsQuerySchema,
  roadmapQuerySchema,
  updateGoalSchema,
} from "@/modules/goals/goal.schemas";
import { createGoalService } from "@/modules/goals/goal.service";
import { createRoadmapService } from "@/modules/goals/roadmap.service";
import { createMilestoneSchema } from "@/modules/milestones/milestone.schemas";
import { createMilestoneService } from "@/modules/milestones/milestone.service";
import { createProjectSchema } from "@/modules/projects/project.schemas";
import { createProjectService } from "@/modules/projects/project.service";
import { toDateOnly } from "@/modules/shared/fields";
import { createSkillIntelligenceService } from "@/modules/skills/skill-intelligence.service";
import { createSkillSchema } from "@/modules/skills/skill.schemas";
import { createSkillService } from "@/modules/skills/skill.service";

import { contextFor, createTestUser, truncateAll } from "./database";

/**
 * Phase 5 goals on real PostgreSQL. Synthetic fixtures relative to today (UTC). Every analytical
 * value is asserted against its source records or its drill-down list (exact reconciliation).
 */
const db = getDb();
const DAY = 86_400_000;
const day = (o: number) => toDateOnly(new Date(Date.now() + o * DAY))!;
const goals = createGoalService(db);
const intel = createGoalIntelligenceService(db);
const analytics = createGoalsAnalyticsService(db);
type Ctx = ReturnType<typeof contextFor>;

const goal = (ctx: Ctx, input: Record<string, unknown>) =>
  goals.create(ctx, parseInput(createGoalSchema, input));
const update = (ctx: Ctx, id: string, input: Record<string, unknown>) =>
  goals.update(ctx, id, parseInput(updateGoalSchema, input));
const listTotal = async (ctx: Ctx, q: Record<string, string>) =>
  (await intel.list(ctx, parseInput(listGoalsQuerySchema, q))).page.total;
const query = (href: string) =>
  Object.fromEntries(new URL(href, "http://x").searchParams.entries());

beforeEach(() => truncateAll());
afterAll(() => db.$disconnect());

describe("goal lifecycle, hierarchy and audit", () => {
  it("create → edit → activate → complete → reopen → delete, audited in order", async () => {
    const ctx = contextFor(await createTestUser("life"));
    const g = await goal(ctx, {
      title: "Fixture: ship v2",
      type: "quarterly_goal",
      deadline: day(30),
    });
    expect(g).toMatchObject({ status: "draft", completedAt: null });
    await update(ctx, g.id, { title: "Fixture: ship v2.0" });
    await expect(update(ctx, g.id, { status: "completed" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    }); // draft → completed not allowed
    await update(ctx, g.id, { status: "active" });
    const done = await update(ctx, g.id, { status: "completed" });
    expect(done).toMatchObject({ status: "completed", completedAt: day(0) });
    const reopened = await update(ctx, g.id, { status: "active" });
    expect(reopened).toMatchObject({ status: "active", completedAt: null });
    await goals.delete(ctx, g.id);
    const actions = (
      await db.auditLog.findMany({
        where: { actorId: ctx.userId, entityType: "goal" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })
    ).map((a) => a.action);
    expect(actions).toEqual([
      "goal.created",
      "goal.updated",
      "goal.updated",
      "goal.completed",
      "goal.reopened",
      "goal.deleted",
    ]);
    // Database invariant: completed ⇔ completion date.
    const h = await goal(ctx, { title: "x", type: "north_star" });
    await expect(
      db.goal.update({ where: { id: h.id }, data: { status: "completed" } }),
    ).rejects.toThrow(/goals_completion_chk/);
  });

  it("hierarchy: valid levels, invalid parents, moves, and deletion refused while children exist", async () => {
    const ctx = contextFor(await createTestUser("tree"));
    const star = await goal(ctx, { title: "North", type: "north_star" });
    const annual = await goal(ctx, {
      title: "Annual",
      type: "annual_objective",
      parentId: star.id,
    });
    const q1 = await goal(ctx, { title: "Q", type: "quarterly_goal", parentId: annual.id });
    await expect(
      goal(ctx, { title: "Bad", type: "annual_objective", parentId: q1.id }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(update(ctx, star.id, { parentId: q1.id })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    }); // would be a cycle
    await expect(update(ctx, annual.id, { parentId: annual.id })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(update(ctx, annual.id, { type: "quarterly_goal" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    }); // child would be level-equal
    // Move the quarterly goal directly under the North Star (level skip allowed).
    expect((await update(ctx, q1.id, { parentId: star.id })).parentId).toBe(star.id);
    await expect(goals.delete(ctx, star.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await goals.delete(ctx, annual.id); // no children any more
    // Another user's goal can never be a parent (service and database).
    const other = contextFor(await createTestUser("tree-other"));
    const foreign = await goal(other, { title: "Theirs", type: "north_star" });
    await expect(update(ctx, q1.id, { parentId: foreign.id })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(
      db.goal.update({ where: { id: q1.id }, data: { parentId: foreign.id } }),
    ).rejects.toThrow();
    await expect(
      db.goal.update({ where: { id: q1.id }, data: { parentId: q1.id } }),
    ).rejects.toThrow(/goals_not_own_parent_chk/);
  });

  it("dependencies stay acyclic and owner-scoped; deleting a goal removes its edges", async () => {
    const ctx = contextFor(await createTestUser("dep"));
    const [a, b, c] = await Promise.all(
      ["A", "B", "C"].map((t) => goal(ctx, { title: t, type: "quarterly_goal" })),
    );
    await goals.replaceDependencies(ctx, a!.id, [b!.id]);
    await goals.replaceDependencies(ctx, b!.id, [c!.id]);
    await expect(goals.replaceDependencies(ctx, c!.id, [a!.id])).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(goals.replaceDependencies(ctx, a!.id, [a!.id])).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    const other = contextFor(await createTestUser("dep-other"));
    const foreign = await goal(other, { title: "Theirs", type: "quarterly_goal" });
    await expect(goals.replaceDependencies(ctx, a!.id, [foreign.id])).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await goals.delete(ctx, b!.id);
    expect(await db.goalDependency.count({ where: { userId: ctx.userId } })).toBe(0);
  });
});

/** A known goal portfolio connected to Phase 3 projects/milestones and Phase 4 skills. */
async function seed(label: string) {
  const ctx = contextFor(await createTestUser(label));
  const skills = createSkillService(db);
  const ts = await skills.create(
    ctx,
    parseInput(createSkillSchema, { name: `${label} TS`, targetLevel: 5 }),
  );
  const ev = await createEvidenceService(db).create(
    ctx,
    parseInput(createEvidenceSchema, { type: "document", title: `${label} doc`, date: day(-10) }),
  );
  await skills.replaceEvidence(ctx, ts.id, [
    { evidenceId: ev.id, strength: "moderate", date: null },
  ]); // level 2 → gap 3 → critical
  const projects = createProjectService(db);
  const platform = await projects.create(
    ctx,
    parseInput(createProjectSchema, {
      name: `${label} Platform`,
      status: "development",
      healthStatus: "at_risk",
    }),
  );
  const ms = createMilestoneService(db);
  const m1 = await ms.create(
    ctx,
    platform.id,
    parseInput(createMilestoneSchema, {
      title: "M1",
      dueDate: day(-20),
      status: "completed",
      completedAt: day(-21),
    }),
  );
  const m2 = await ms.create(
    ctx,
    platform.id,
    parseInput(createMilestoneSchema, { title: "M2 overdue", dueDate: day(-2) }),
  );
  const m3 = await ms.create(
    ctx,
    platform.id,
    parseInput(createMilestoneSchema, { title: "M3", dueDate: day(40) }),
  );

  const star = await goal(ctx, { title: `${label} North`, type: "north_star", status: "active" });
  const main = await goal(ctx, {
    title: `${label} Ship platform`,
    type: "quarterly_goal",
    parentId: star.id,
    status: "active",
    metric: "p95 latency",
    unit: "ms",
    baseline: 400,
    target: 200,
    startDate: day(-60),
    deadline: day(45),
  });
  await goals.replaceProjects(ctx, main.id, [platform.id]);
  await goals.replaceSkills(ctx, main.id, [ts.id]);
  await goals.replaceMilestones(ctx, main.id, [m1.id, m2.id, m3.id]);
  await goals.addMeasurement(
    ctx,
    main.id,
    parseInput(createMeasurementSchema, { date: day(-30), value: 350 }),
  );
  await goals.addMeasurement(
    ctx,
    main.id,
    parseInput(createMeasurementSchema, { date: day(-5), value: 300 }),
  );
  const late = await goal(ctx, {
    title: `${label} Late`,
    type: "quarterly_goal",
    status: "active",
    deadline: day(-3),
  });
  const idle = await goal(ctx, {
    title: `${label} Idle`,
    type: "annual_objective",
    status: "on_hold",
  });
  const done = await goal(ctx, {
    title: `${label} Done`,
    type: "quarterly_goal",
    status: "active",
    deadline: day(-40),
    baseline: 0,
    target: 10,
  });
  await goals.addMeasurement(
    ctx,
    done.id,
    parseInput(createMeasurementSchema, { date: day(-41), value: 12 }),
  );
  await update(ctx, done.id, { status: "completed", completedAt: day(-39) });
  await goal(ctx, { title: `${label} Draft`, type: "quarterly_goal" });
  const blocked = await goal(ctx, {
    title: `${label} Blocked`,
    type: "quarterly_goal",
    status: "active",
    deadline: day(80),
  });
  await goals.replaceDependencies(ctx, blocked.id, [late.id]);
  return { ctx, ts, platform, m1, m2, m3, star, main, late, idle, done, blocked };
}

describe("goal intelligence (dossier)", () => {
  it("derives every signal from real records and reuses Phase 4 skill intelligence", async () => {
    const s = await seed("dos");
    const d = await intel.get(s.ctx, s.main.id);
    expect(d.signals.milestones).toEqual({
      total: 3,
      completed: 1,
      overdue: 1,
      blocked: 0,
      ratio: 1 / 3,
    });
    expect(d.signals.projects).toEqual({ total: 1, delivered: 0, atRiskOrBlocked: 1 });
    expect(d.attainment).toMatchObject({
      state: "in_progress",
      progress: 0.5,
      latest: { date: day(-5), value: 300 },
    });
    expect(d.risk.state).toBe("at_risk");
    expect(d.risk.signals.map((x) => x.key).sort()).toEqual([
      "overdue_milestones",
      "project_health",
      "skill_gaps",
    ]);
    // Skill rows are exactly Phase 4's (no duplicated level logic).
    const phase4 = await createSkillIntelligenceService(db).get(s.ctx, s.ts.id);
    expect(d.skills).toEqual([phase4.row]);
    expect(d.parent).toMatchObject({ id: s.star.id });
    expect(d.milestones.map((m) => [m.title, m.overdue])).toEqual([
      ["M1", false],
      ["M2 overdue", true],
      ["M3", false],
    ]);
    expect(d.measurements.map((m) => m.value)).toEqual([350, 300]);
    // A milestone counts toward one goal only.
    await expect(goals.replaceMilestones(s.ctx, s.blocked.id, [s.m2.id])).rejects.toMatchObject({
      code: "CONFLICT",
    });
    // Deleting the goal unlinks milestones; it never deletes them.
    await goals.delete(s.ctx, s.main.id);
    expect(
      await db.milestone.count({ where: { userId: s.ctx.userId, projectId: s.platform.id } }),
    ).toBe(3);
    expect(
      await db.milestone.count({ where: { userId: s.ctx.userId, goalId: { not: null } } }),
    ).toBe(0);
  });

  it("dependency on an overdue goal is a risk signal; nothing to assess is explicit", async () => {
    const s = await seed("dep2");
    expect((await intel.get(s.ctx, s.blocked.id)).risk.signals.map((x) => x.key)).toEqual([
      "dependencies",
    ]);
    expect((await intel.get(s.ctx, s.idle.id)).risk.state).toBe("not_assessable");
    expect((await intel.get(s.ctx, s.done.id)).risk.state).toBe("not_applicable");
  });

  it("measurements: no future dates; require baseline and target", async () => {
    const s = await seed("meas");
    await expect(
      goals.addMeasurement(
        s.ctx,
        s.main.id,
        parseInput(createMeasurementSchema, { date: day(2), value: 1 }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      goals.addMeasurement(
        s.ctx,
        s.late.id,
        parseInput(createMeasurementSchema, { date: day(-1), value: 1 }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const m = await goals.addMeasurement(
      s.ctx,
      s.main.id,
      parseInput(createMeasurementSchema, { date: day(0), value: 190 }),
    );
    expect((await intel.get(s.ctx, s.main.id)).attainment.state).toBe("attained");
    await goals.deleteMeasurement(s.ctx, s.main.id, m.id);
    expect((await intel.get(s.ctx, s.main.id)).attainment.state).toBe("in_progress");
  });
});

describe("goal analytics reconcile with the goals list", () => {
  it("every metric and bucket equals its drill-down list total", async () => {
    const s = await seed("rec");
    const a = await analytics.summary(s.ctx);
    const period = { from: null, to: null };
    expect(a.total.value).toBe(7);
    expect(a.active.value).toBe(4); // North, Ship platform, Late, Blocked (Done is completed, Idle on hold)
    expect(a.overdue.value).toBe(1); // late
    expect(a.completionRate).toMatchObject({ value: 1 / 2 }); // 1 completed / (1 + 1 overdue)
    expect(a.attainment).toMatchObject({ value: 1 / 2 }); // done attained, main in progress
    for (const metric of [
      a.total,
      a.active,
      a.overdue,
      a.atRisk,
      a.onTrack,
      a.withoutDeadline,
      a.withoutProjects,
      a.withoutSkills,
      a.withSkillGaps,
    ]) {
      const href = metricHref(metric.key, {}, period)!;
      expect(await listTotal(s.ctx, query(href)), metric.key).toBe(metric.value);
    }
    expect(await listTotal(s.ctx, query(metricHref("goals.completion_rate", {}, period)!))).toBe(1);
    expect(await listTotal(s.ctx, query(metricHref("goals.target_attainment", {}, period)!))).toBe(
      1,
    );
    for (const m of [a.risk, a.status, a.attainmentStates, a.load]) {
      for (const b of m.breakdown!) {
        const href = bucketHref(m.key, b.key, {})!;
        expect(await listTotal(s.ctx, query(href)), `${m.key}:${b.key}`).toBe(b.value);
      }
    }
    expect(a.load.breakdown!.reduce((n, b) => n + b.value, 0)).toBe(a.recordCounts.open);
    expect(a.attention.map((x) => x.title).sort()).toEqual([
      "rec Blocked",
      "rec Late",
      "rec Ship platform",
    ]);
  });

  it("the Command Center shows the same Active goals and at-risk goals", async () => {
    const s = await seed("cc");
    const dash = await createDashboardService(db).dashboard(
      s.ctx,
      parseInput(dashboardFiltersSchema, {}),
    );
    const a = await analytics.summary(s.ctx);
    expect(dash.kpis.find((k) => k.key === "goals.active")?.value).toBe(a.active.value);
    expect(dash.goals.attention).toEqual(a.attention);
  });

  it("an empty account gets no-data states, not zeros", async () => {
    const ctx = contextFor(await createTestUser("none"));
    const a = await analytics.summary(ctx);
    expect(a.active).toMatchObject({ state: "no_data", value: null });
    expect(a.completionRate).toMatchObject({ state: "no_data", value: null });
    expect(a.attainment).toMatchObject({ state: "no_data", value: null });
    await goal(ctx, { title: "Only a draft", type: "north_star" });
    const b = await analytics.summary(ctx);
    expect(b.completionRate).toMatchObject({ state: "insufficient_data", value: null });
    expect(b.attainment).toMatchObject({ state: "insufficient_data", value: null });
  });

  it("list filters, sort and pagination are server-side and deterministic", async () => {
    const s = await seed("lst");
    expect(await listTotal(s.ctx, { projectId: s.platform.id })).toBe(1);
    expect(await listTotal(s.ctx, { skillId: s.ts.id })).toBe(1);
    expect(await listTotal(s.ctx, { q: "idle" })).toBe(1);
    expect(await listTotal(s.ctx, { q: "late" })).toBe(2); // "Late" and the metric "p95 latency"
    expect(await listTotal(s.ctx, { parentId: s.star.id })).toBe(1);
    expect(await listTotal(s.ctx, { root: "true" })).toBe(6);
    const p1 = await intel.list(
      s.ctx,
      parseInput(listGoalsQuerySchema, { pageSize: "3", sort: "title" }),
    );
    const p2 = await intel.list(
      s.ctx,
      parseInput(listGoalsQuerySchema, { pageSize: "3", page: "2", sort: "title" }),
    );
    expect([...p1.data, ...p2.data].map((g) => g.title)).toEqual([
      "lst Blocked",
      "lst Done",
      "lst Draft",
      "lst Idle",
      "lst Late",
      "lst North",
    ]);
  });
});

describe("roadmap", () => {
  it("places only dated goals on the timeline, lists undated ones, and exposes tree and dependencies", async () => {
    const s = await seed("rm");
    const r = await createRoadmapService(db).roadmap(s.ctx, parseInput(roadmapQuerySchema, {}));
    const titles = r.timeline.map((g) => g.title);
    expect(titles).toEqual(expect.arrayContaining(["rm Ship platform", "rm Late", "rm Blocked"]));
    expect(r.timeline.every((g) => g.deadline !== null)).toBe(true);
    expect(r.undated.items.map((g) => g.title).sort()).toEqual(["rm Idle", "rm North"]);
    expect(r.tree).toHaveLength(7);
    expect(r.tree.find((n) => n.id === s.main.id)?.parentId).toBe(s.star.id);
    expect(r.dependencies).toEqual([{ goalId: s.blocked.id, dependsOnGoalId: s.late.id }]);
    const narrow = await createRoadmapService(db).roadmap(
      s.ctx,
      parseInput(roadmapQuerySchema, { from: day(60), to: day(100) }),
    );
    expect(narrow.timeline.map((g) => g.title)).toEqual(
      expect.arrayContaining(["rm Blocked", "rm Late"]),
    ); // Late: overdue open goals stay visible
    expect(narrow.timeline.map((g) => g.title)).not.toContain("rm Ship platform");
  });
});
