import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors/app-error";
import { parseInput } from "@/lib/validation/parse";

import { quarterBounds, quarterOf, quartersBetween } from "./goal-intelligence";
import {
  assertChildrenFit,
  assertTransition,
  assertValidParent,
  attainment,
  canBeParent,
  createsDependencyCycle,
  GOAL_STATUSES,
  GOAL_TRANSITIONS,
  goalRisk,
  goalTransitionVerb,
  isGoalOverdue,
  resolveGoalCompletion,
  type RiskInputs,
} from "./goal.rules";
import {
  createGoalSchema,
  createMeasurementSchema,
  listGoalsQuerySchema,
  roadmapQuerySchema,
} from "./goal.schemas";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const NOW = new Date("2026-10-03T22:00:00Z");
const pathOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? (e.details?.[0]?.path ?? e.code) : "other";
  }
  return null;
};

describe("goal hierarchy (01 §8, ADR 0031)", () => {
  it("a parent must be a strictly higher level; levels may be skipped", () => {
    expect(canBeParent("north_star", "annual_objective")).toBe(true);
    expect(canBeParent("north_star", "quarterly_goal")).toBe(true);
    expect(canBeParent("annual_objective", "quarterly_goal")).toBe(true);
    expect(canBeParent("quarterly_goal", "annual_objective")).toBe(false);
    expect(canBeParent("annual_objective", "annual_objective")).toBe(false);
  });

  it("rejects self-parenting and lower or equal parents", () => {
    expect(
      pathOf(() =>
        assertValidParent({ id: "g1", type: "quarterly_goal" }, { id: "g1", type: "north_star" }),
      ),
    ).toBe("parentId");
    expect(
      pathOf(() =>
        assertValidParent({ type: "annual_objective" }, { id: "p", type: "quarterly_goal" }),
      ),
    ).toBe("parentId");
    expect(
      pathOf(() =>
        assertValidParent({ type: "quarterly_goal" }, { id: "p", type: "annual_objective" }),
      ),
    ).toBeNull();
    expect(pathOf(() => assertValidParent({ type: "north_star" }, null))).toBeNull();
  });

  it("strict rank makes cycles impossible and bounds depth at 3", () => {
    // Any chain must strictly increase in rank, so the longest chain has 3 goals.
    const types = ["north_star", "annual_objective", "quarterly_goal"] as const;
    for (const a of types)
      for (const b of types) if (canBeParent(a, b)) expect(canBeParent(b, a)).toBe(false);
  });

  it("changing a goal's type must keep its children below it", () => {
    expect(pathOf(() => assertChildrenFit("quarterly_goal", ["quarterly_goal"]))).toBe("type");
    expect(
      pathOf(() => assertChildrenFit("north_star", ["annual_objective", "quarterly_goal"])),
    ).toBeNull();
  });
});

describe("goal dependencies (acyclic)", () => {
  const edges = [
    { goalId: "a", dependsOnGoalId: "b" },
    { goalId: "b", dependsOnGoalId: "c" },
  ];
  it("detects self, direct and indirect cycles", () => {
    expect(createsDependencyCycle(edges, "a", "a")).toBe(true);
    expect(createsDependencyCycle(edges, "b", "a")).toBe(true); // b→a while a→b
    expect(createsDependencyCycle(edges, "c", "a")).toBe(true); // c→a while a→b→c
    expect(createsDependencyCycle(edges, "a", "c")).toBe(false); // redundant but acyclic
    expect(createsDependencyCycle(edges, "d", "a")).toBe(false);
  });

  it("terminates on large graphs (each node visited once)", () => {
    const chain = Array.from({ length: 5000 }, (_, i) => ({
      goalId: `g${i}`,
      dependsOnGoalId: `g${i + 1}`,
    }));
    expect(createsDependencyCycle(chain, "g5000", "g0")).toBe(true);
    expect(createsDependencyCycle(chain, "x", "g0")).toBe(false);
  });
});

describe("goal lifecycle (goal-lifecycle-v1)", () => {
  it("allows exactly the transition table; same-status updates are allowed", () => {
    for (const from of GOAL_STATUSES) {
      for (const to of GOAL_STATUSES) {
        const allowed = from === to || GOAL_TRANSITIONS[from].includes(to);
        expect(
          pathOf(() => assertTransition(from, to)),
          `${from}→${to}`,
        ).toBe(allowed ? null : "status");
      }
    }
    expect(GOAL_TRANSITIONS.draft).not.toContain("completed"); // activate first
    expect(GOAL_TRANSITIONS.completed).toEqual(["active"]); // reopen
  });

  it("completion: today by default, past allowed, future and stray dates rejected, reopen clears", () => {
    expect(resolveGoalCompletion({ status: "completed", completedAt: undefined }, NOW)).toEqual({
      status: "completed",
      completedAt: d("2026-10-03"),
    });
    expect(
      resolveGoalCompletion({ status: "completed", completedAt: d("2026-09-01") }, NOW).completedAt,
    ).toEqual(d("2026-09-01"));
    expect(
      pathOf(() =>
        resolveGoalCompletion({ status: "completed", completedAt: d("2026-10-04") }, NOW),
      ),
    ).toBe("completedAt");
    expect(
      pathOf(() => resolveGoalCompletion({ status: "active", completedAt: d("2026-09-01") }, NOW)),
    ).toBe("completedAt");
    expect(resolveGoalCompletion({ status: "active", completedAt: null }, NOW)).toEqual({
      status: "active",
      completedAt: null,
    });
    expect(goalTransitionVerb("active", "completed")).toBe("completed");
    expect(goalTransitionVerb("completed", "active")).toBe("reopened");
    expect(goalTransitionVerb("active", "on_hold")).toBe("updated");
  });

  it("overdue: open goals past their deadline (UTC day boundary); drafts and closed goals never", () => {
    expect(isGoalOverdue({ status: "active", deadline: d("2026-10-02") }, NOW)).toBe(true);
    expect(isGoalOverdue({ status: "on_hold", deadline: d("2026-10-02") }, NOW)).toBe(true);
    expect(isGoalOverdue({ status: "active", deadline: d("2026-10-03") }, NOW)).toBe(false);
    expect(isGoalOverdue({ status: "active", deadline: null }, NOW)).toBe(false);
    expect(isGoalOverdue({ status: "draft", deadline: d("2020-01-01") }, NOW)).toBe(false);
    expect(isGoalOverdue({ status: "completed", deadline: d("2020-01-01") }, NOW)).toBe(false);
    expect(
      isGoalOverdue(
        { status: "active", deadline: d("2026-10-03") },
        new Date("2026-10-04T00:00:00Z"),
      ),
    ).toBe(true);
  });
});

describe("target attainment (goal-attainment-v1)", () => {
  const m = (value: number) => ({ date: d("2026-09-01"), value });
  it("higher-is-better and lower-is-better targets", () => {
    expect(attainment({ baseline: 0, target: 100 }, m(50))).toMatchObject({
      state: "in_progress",
      progress: 0.5,
    });
    expect(attainment({ baseline: 0, target: 100 }, m(100))).toMatchObject({
      state: "attained",
      progress: 1,
    });
    expect(attainment({ baseline: 500, target: 200 }, m(350))).toMatchObject({
      state: "in_progress",
      progress: 0.5,
    });
    expect(attainment({ baseline: 500, target: 200 }, m(150)).state).toBe("attained");
    expect(attainment({ baseline: 500, target: 200 }, m(600))).toMatchObject({
      state: "regressed",
      progress: -1 / 3,
    });
  });

  it("missing inputs are not computable — never 0 % or 100 %", () => {
    expect(attainment({ baseline: null, target: 100 }, m(50))).toMatchObject({
      state: "not_computable",
      progress: null,
    });
    expect(attainment({ baseline: 0, target: null }, m(50)).state).toBe("not_computable");
    expect(attainment({ baseline: 10, target: 10 }, m(10)).explanation).toContain(
      "equals the baseline",
    );
    expect(attainment({ baseline: 0, target: 100 }, null)).toMatchObject({
      state: "not_computable",
      explanation: "No measurement is recorded yet.",
    });
  });

  it("explains with units", () => {
    expect(attainment({ baseline: 300, target: 100, unit: "ms" }, m(200)).explanation).toContain(
      "from 300 ms to 100 ms",
    );
  });
});

describe("goal risk (goal-risk-v1)", () => {
  const base: RiskInputs = {
    status: "active",
    deadline: d("2027-01-01"),
    milestones: { total: 0, overdue: 0, blocked: 0 },
    projects: { total: 0, atRiskOrBlocked: 0 },
    skills: { total: 0, critical: 0 },
    dependencies: { total: 0, blocking: 0 },
    attainment: "not_computable",
    hasMeasurements: false,
  };
  it("each real signal makes an open goal at risk; signals are listed, not scored", () => {
    const cases: [Partial<RiskInputs>, string][] = [
      [{ deadline: d("2026-01-01") }, "overdue"],
      [{ milestones: { total: 2, overdue: 1, blocked: 0 } }, "overdue_milestones"],
      [{ milestones: { total: 2, overdue: 0, blocked: 1 } }, "blocked_milestones"],
      [{ projects: { total: 1, atRiskOrBlocked: 1 } }, "project_health"],
      [{ skills: { total: 1, critical: 1 } }, "skill_gaps"],
      [{ dependencies: { total: 1, blocking: 1 } }, "dependencies"],
      [{ attainment: "regressed", hasMeasurements: true }, "regressed"],
    ];
    for (const [patch, key] of cases) {
      const r = goalRisk({ ...base, ...patch }, NOW);
      expect(r.state, key).toBe("at_risk");
      expect(
        r.signals.map((s) => s.key),
        key,
      ).toEqual([key]);
    }
  });

  it("on track needs an assessable input; nothing to assess is explicit", () => {
    expect(goalRisk(base, NOW).state).toBe("on_track");
    expect(goalRisk({ ...base, deadline: null }, NOW).state).toBe("not_assessable");
    expect(goalRisk({ ...base, deadline: null, hasMeasurements: true }, NOW).state).toBe(
      "on_track",
    );
  });

  it("drafts and closed goals are not assessed", () => {
    for (const status of ["draft", "completed", "cancelled"] as const) {
      expect(goalRisk({ ...base, status, deadline: d("2020-01-01") }, NOW)).toMatchObject({
        state: "not_applicable",
        signals: [],
      });
    }
  });
});

describe("validation and calendar helpers", () => {
  it("goal input strips ownership ids and validates fields", () => {
    const input = parseInput(createGoalSchema, {
      title: " Ship v2 ",
      type: "quarterly_goal",
      userId: "x",
      deadline: "2026-12-31",
      baseline: 1,
      target: 2,
    }) as Record<string, unknown>;
    expect(input).not.toHaveProperty("userId");
    expect(input.title).toBe("Ship v2");
    expect(() => parseInput(createGoalSchema, { title: "x", type: "milestone" })).toThrow();
    expect(() =>
      parseInput(createGoalSchema, { title: "x", type: "north_star", baseline: Infinity }),
    ).toThrow();
    expect(() => parseInput(createMeasurementSchema, { date: "2026-02-30", value: 1 })).toThrow();
    expect(() => parseInput(listGoalsQuerySchema, { risk: "doomed" })).toThrow();
    expect(() => parseInput(listGoalsQuerySchema, { pageSize: "1000" })).toThrow();
    expect(() =>
      parseInput(roadmapQuerySchema, { from: "2020-01-01", to: "2027-01-01" }),
    ).toThrow();
  });

  it("UTC quarters", () => {
    expect(quarterOf(d("2026-10-03"))).toBe("2026-Q4");
    expect(quarterOf(d("2026-12-31"))).toBe("2026-Q4");
    expect(quarterOf(d("2027-01-01"))).toBe("2027-Q1");
    expect(quarterBounds("2026-Q1")).toEqual({ from: d("2026-01-01"), to: d("2026-03-31") });
    expect(quartersBetween(d("2026-11-15"), d("2027-04-01"))).toEqual([
      "2026-Q4",
      "2027-Q1",
      "2027-Q2",
    ]);
  });
});
