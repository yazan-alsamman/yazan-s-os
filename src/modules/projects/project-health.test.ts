import { describe, expect, it } from "vitest";

import {
  activityComponent,
  bandOf,
  blockerComponent,
  computeProjectHealth,
  deliveryRate,
  HEALTH_COMPONENTS,
  HEALTH_MODEL_VERSION,
  milestoneComponent,
  scheduleComponent,
  type HealthInputs,
} from "./project-health";
import { LIFECYCLE_ORDER } from "./project.lifecycle";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const NOW = new Date("2026-10-03T12:00:00Z");

const inputs = (over: Partial<HealthInputs> = {}): HealthInputs => ({
  status: "development",
  targetDate: null,
  completedAt: null,
  milestones: { total: 0, completed: 0, overdue: 0, open: 0, blocked: 0 },
  recentEvents: 0,
  ...over,
});

describe("delivery rate (05: completed / planned)", () => {
  it("is completed / (completed + overdue) and never divides by zero", () => {
    expect(deliveryRate({ completed: 7, overdue: 3 })).toBeCloseTo(0.7);
    expect(deliveryRate({ completed: 0, overdue: 4 })).toBe(0);
    expect(deliveryRate({ completed: 2, overdue: 0 })).toBe(1);
    expect(deliveryRate({ completed: 0, overdue: 0 })).toBeNull();
  });
});

describe("schedule component", () => {
  it("is insufficient without a target date (open or completed)", () => {
    expect(scheduleComponent(inputs(), NOW)).toMatchObject({
      state: "insufficient_data",
      score: null,
    });
    expect(scheduleComponent(inputs({ completedAt: d("2026-05-01") }), NOW)).toMatchObject({
      state: "insufficient_data",
    });
  });

  it("open project: target today or later scores 100; passed scores 0 (boundary at today)", () => {
    expect(scheduleComponent(inputs({ targetDate: d("2026-10-03") }), NOW)).toMatchObject({
      score: 100,
      explanation: expect.stringContaining("is today"),
    });
    expect(scheduleComponent(inputs({ targetDate: d("2026-10-13") }), NOW).explanation).toContain(
      "10 days away",
    );
    expect(scheduleComponent(inputs({ targetDate: d("2026-10-02") }), NOW)).toMatchObject({
      score: 0,
      explanation: expect.stringContaining("passed 1 day ago"),
    });
  });

  it("completed project: on/before target 100, late 50", () => {
    const target = d("2026-06-30");
    expect(
      scheduleComponent(inputs({ targetDate: target, completedAt: d("2026-06-30") }), NOW).score,
    ).toBe(100);
    expect(
      scheduleComponent(inputs({ targetDate: target, completedAt: d("2026-07-05") }), NOW),
    ).toMatchObject({ score: 50, explanation: expect.stringContaining("5 days after") });
  });
});

describe("milestone and blocker components", () => {
  it("milestones: insufficient without completed/overdue milestones; otherwise 100 × rate", () => {
    expect(milestoneComponent(inputs()).explanation).toBe("No milestones are recorded.");
    expect(
      milestoneComponent(
        inputs({ milestones: { total: 3, completed: 0, overdue: 0, open: 3, blocked: 0 } }),
      ),
    ).toMatchObject({ state: "insufficient_data" });
    expect(
      milestoneComponent(
        inputs({ milestones: { total: 12, completed: 7, overdue: 3, open: 5, blocked: 0 } }),
      ),
    ).toMatchObject({
      state: "scored",
      score: 70,
      explanation:
        "7 of 10 milestones that are done or past their planned date are complete (3 overdue milestones).",
    });
  });

  it("blockers: insufficient without open milestones; any blocked → 0; none → 100", () => {
    expect(blockerComponent(inputs()).state).toBe("insufficient_data");
    expect(
      blockerComponent(
        inputs({ milestones: { total: 5, completed: 0, overdue: 0, open: 5, blocked: 1 } }),
      ),
    ).toMatchObject({ score: 0, explanation: "1 of 5 open milestones is blocked." });
    expect(
      blockerComponent(
        inputs({ milestones: { total: 2, completed: 0, overdue: 0, open: 2, blocked: 0 } }),
      ),
    ).toMatchObject({ score: 100 });
  });
});

describe("recent activity component", () => {
  it("applies only to active lifecycle stages and uses presence, not volume", () => {
    for (const status of LIFECYCLE_ORDER) {
      const state = activityComponent(inputs({ status, recentEvents: 3 })).state;
      expect(state, status).toBe(
        ["discovery", "architecture", "development", "validation"].includes(status)
          ? "scored"
          : "not_applicable",
      );
    }
    expect(activityComponent(inputs({ recentEvents: 0 })).score).toBe(0);
    expect(activityComponent(inputs({ recentEvents: 1 })).score).toBe(100);
    expect(activityComponent(inputs({ recentEvents: 500 })).score).toBe(100);
  });
});

describe("overall computed health (project-health-v1)", () => {
  it("always reports all six spec components; scope stability and issue severity are unavailable", () => {
    const health = computeProjectHealth(inputs(), NOW);
    expect(health.model).toBe(HEALTH_MODEL_VERSION);
    expect(health.components.map((c) => c.key)).toEqual([...HEALTH_COMPONENTS]);
    for (const key of ["scope_stability", "issue_severity"]) {
      expect(health.components.find((c) => c.key === key)).toMatchObject({
        state: "unavailable",
        score: null,
      });
    }
  });

  it("missing inputs never become zero or a default: < 2 scored components → no overall score", () => {
    const health = computeProjectHealth(inputs({ status: "idea" }), NOW);
    expect(health).toMatchObject({ status: "insufficient_data", score: null, band: null });
    expect(health.scoredComponents).toBe(0);
    expect(health.explanation).toContain("at least 2");
  });

  it("is the equal-weight mean of scored components, partial in v1, with a band", () => {
    const health = computeProjectHealth(
      inputs({
        targetDate: d("2026-12-31"),
        milestones: { total: 10, completed: 7, overdue: 3, open: 3, blocked: 1 },
        recentEvents: 4,
      }),
      NOW,
    );
    // schedule 100, milestones 70, blockers 0, activity 100 → 67.5 → 68
    expect(health).toMatchObject({
      status: "partial",
      score: 68,
      band: "watch",
      scoredComponents: 4,
    });
    expect(health.explanation).toContain(
      "Schedule 100, Milestone completion 70, Blockers 0, Recent activity 100",
    );
    expect(health.evaluatedOn).toBe("2026-10-03");
  });

  it("archived projects are not assessed", () => {
    expect(computeProjectHealth(inputs({ status: "archived" }), NOW)).toMatchObject({
      status: "not_applicable",
      score: null,
      components: [],
    });
  });

  it("band boundaries: 75 good, 74 watch, 50 watch, 49 poor", () => {
    expect([bandOf(100), bandOf(75), bandOf(74), bandOf(50), bandOf(49), bandOf(0)]).toEqual([
      "good",
      "good",
      "watch",
      "watch",
      "poor",
      "poor",
    ]);
  });

  it("is deterministic: the same inputs and day give the same result regardless of the hour", () => {
    const a = computeProjectHealth(
      inputs({ targetDate: d("2026-10-03") }),
      new Date("2026-10-03T00:00:00Z"),
    );
    const b = computeProjectHealth(
      inputs({ targetDate: d("2026-10-03") }),
      new Date("2026-10-03T23:59:59Z"),
    );
    expect(a).toEqual(b);
  });
});
