import { describe, expect, it } from "vitest";

import { bucketHref, metricHref } from "@/components/command-center/drilldown";
import type { Goal } from "@/generated/prisma/client";
import { matchesGoalQuery } from "@/modules/analytics/goals-analytics.service";

import { matchesDerived, sortGoals, type AnalysedGoal } from "./goal-intelligence";
import { attainment, goalRisk } from "./goal.rules";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const NOW = new Date("2026-10-03T12:00:00Z");

function analysed(
  over: Partial<Goal> & { id: string; title: string },
  extra: Partial<{
    projects: number;
    skills: number;
    below: number;
    overdueMilestones: number;
  }> = {},
): AnalysedGoal {
  const goal: Goal = {
    userId: "u",
    parentId: null,
    type: "quarterly_goal",
    description: null,
    outcome: null,
    metric: null,
    unit: null,
    baseline: null,
    target: null,
    startDate: null,
    deadline: null,
    status: "active",
    completedAt: null,
    confidence: null,
    createdAt: d("2026-01-01"),
    updatedAt: d("2026-01-01"),
    ...over,
  };
  const overdue =
    (goal.status === "active" || goal.status === "on_hold") &&
    goal.deadline !== null &&
    goal.deadline < d("2026-10-03");
  const att = attainment(goal, null);
  const milestones = { total: 0, completed: 0, overdue: extra.overdueMilestones ?? 0, blocked: 0 };
  return {
    goal,
    overdue,
    attainment: att,
    risk: goalRisk(
      {
        status: goal.status,
        deadline: goal.deadline,
        milestones,
        projects: { total: extra.projects ?? 0, atRiskOrBlocked: 0 },
        skills: { total: extra.skills ?? 0, critical: 0 },
        dependencies: { total: 0, blocking: 0 },
        attainment: att.state,
        hasMeasurements: false,
      },
      NOW,
    ),
    signals: {
      milestones: { ...milestones, ratio: null },
      projects: { total: extra.projects ?? 0, delivered: 0, atRiskOrBlocked: 0 },
      skills: {
        total: extra.skills ?? 0,
        atOrAbove: 0,
        below: extra.below ?? 0,
        notComputable: 0,
        noTarget: 0,
        critical: 0,
      },
      dependencies: { total: 0, blocking: 0 },
      measurements: { count: 0, latest: null },
    },
  };
}

const late = analysed({ id: "a", title: "Late", deadline: d("2026-09-30") });
const soon = analysed({ id: "b", title: "Soon", deadline: d("2026-11-15") }, { projects: 1 });
const undated = analysed({ id: "c", title: "Undated" }, { skills: 2, below: 1 });
const draft = analysed({ id: "d", title: "Draft", status: "draft", deadline: d("2026-01-01") });
const done = analysed({
  id: "e",
  title: "Done",
  status: "completed",
  completedAt: d("2026-08-01"),
  deadline: d("2026-07-01"),
});
const twinA = analysed({ id: "f1", title: "Twin", deadline: d("2026-12-01") });
const twinB = analysed({ id: "f2", title: "Twin", deadline: d("2026-12-01") });
const ALL = [twinB, done, undated, late, draft, soon, twinA];

describe("goal ordering is deterministic", () => {
  it("deadline ascending, undated last, ties by title then id", () => {
    expect(sortGoals(ALL, "deadline").map((a) => a.goal.id)).toEqual([
      "d",
      "e",
      "a",
      "b",
      "f1",
      "f2",
      "c",
    ]);
  });

  it("risk: at risk first, then on track, not assessable, not applicable", () => {
    const states = sortGoals(ALL, "risk").map((a) => a.risk.state);
    expect(states).toEqual([...states].sort((x, y) => RANK[x] - RANK[y]));
    expect(states[0]).toBe("at_risk");
    expect(sortGoals(ALL, "risk")[0]!.goal.id).toBe("a");
  });

  it("the same input in any order gives the same output", () => {
    const reversed = [...ALL].reverse();
    for (const sort of ["deadline", "title", "status", "updatedAt", "risk"] as const) {
      expect(sortGoals(reversed, sort).map((a) => a.goal.id)).toEqual(
        sortGoals(ALL, sort).map((a) => a.goal.id),
      );
    }
  });
});

const RANK = { at_risk: 0, on_track: 1, not_assessable: 2, not_applicable: 3 } as const;

describe("list and metric predicates are the same function (ADR 0034)", () => {
  const ids = (q: Parameters<typeof matchesGoalQuery>[1]) =>
    ALL.filter((a) => matchesGoalQuery(a, q))
      .map((a) => a.goal.id)
      .sort();

  it("open, committed, overdue and deadline filters", () => {
    expect(ids({ open: true })).toEqual(["a", "b", "c", "f1", "f2"]);
    expect(ids({ committed: true })).toEqual(["a", "b", "c", "e", "f1", "f2"]);
    expect(ids({ committed: false })).toEqual(["d"]);
    expect(ids({ overdue: true })).toEqual(["a"]); // the draft and the completed goal are never overdue
    expect(ids({ open: true, hasDeadline: false })).toEqual(["c"]);
    expect(
      ids({
        open: true,
        overdue: false,
        deadlineFrom: d("2026-10-01"),
        deadlineTo: d("2026-12-31"),
      }),
    ).toEqual(["b", "f1", "f2"]);
  });

  it("relationship and derived filters", () => {
    expect(ids({ open: true, hasProjects: false })).toEqual(["a", "c", "f1", "f2"]);
    expect(ids({ open: true, hasSkills: true })).toEqual(["c"]);
    expect(ids({ open: true, skillGap: true })).toEqual(["c"]);
    expect(ids({ risk: "at_risk" })).toEqual(["a"]);
    expect(ids({ attainment: "not_computable" })).toEqual(["a", "b", "c", "d", "e", "f1", "f2"]);
    expect(matchesDerived(late, { overdue: true, risk: "at_risk" })).toBe(true);
    expect(matchesDerived(late, { attainment: "attained" })).toBe(false);
  });
});

describe("goal drill-downs", () => {
  const none = { from: null, to: null };
  it("single-value goal metrics open the goals list with the metric's predicate", () => {
    expect(metricHref("goals.overdue", {}, none)).toBe("/goals?overdue=true");
    expect(metricHref("goals.target_attainment", {}, none)).toBe(
      "/goals?committed=true&attainment=attained",
    );
    expect(metricHref("goals.without_deadline", {}, none)).toBe(
      "/goals?open=true&hasDeadline=false",
    );
    expect(metricHref("goals.burndown", { goalId: "g1" }, none)).toBe("/goals/g1");
  });

  it("deadline-load buckets map to disjoint, clock-free list filters", () => {
    expect(bucketHref("goals.deadline_load", "overdue", {})).toBe("/goals?open=true&overdue=true");
    expect(bucketHref("goals.deadline_load", "none", {})).toBe(
      "/goals?open=true&hasDeadline=false",
    );
    expect(bucketHref("goals.deadline_load", "2026-Q4", {})).toBe(
      "/goals?open=true&overdue=false&deadlineFrom=2026-10-01&deadlineTo=2026-12-31",
    );
    expect(bucketHref("goals.deadline_load", "2028-Q1", {})).toBe(
      "/goals?open=true&overdue=false&deadlineFrom=2028-01-01&deadlineTo=2028-03-31",
    );
    expect(bucketHref("goals.deadline_load", "after:2028-04-01", {})).toBe(
      "/goals?open=true&overdue=false&deadlineFrom=2028-04-01",
    );
    expect(bucketHref("goals.deadline_load", "2026-Q5", {})).toBeNull();
    expect(bucketHref("goals.attainment_distribution", "regressed", {})).toBe(
      "/goals?committed=true&attainment=regressed",
    );
  });
});
