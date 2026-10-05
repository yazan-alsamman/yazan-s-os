import { describe, expect, it } from "vitest";

import {
  daysUntil,
  deadlineSeverity,
  dedupeKey,
  describeDelta,
  gapSeverity,
  skillFreshness,
  skillSignal,
  weekStart,
  weekWindows,
} from "./intelligence.rules";

const now = new Date("2026-06-15T12:00:00.000Z"); // a Monday

describe("skillFreshness", () => {
  it("is insufficient with no demonstration", () => {
    expect(skillFreshness(null, now)).toBe("insufficient");
  });
  it("is fresh within a year, aging within two, stale beyond", () => {
    expect(skillFreshness(new Date("2026-01-01T00:00:00Z"), now)).toBe("fresh");
    expect(skillFreshness(new Date("2025-01-01T00:00:00Z"), now)).toBe("aging");
    expect(skillFreshness(new Date("2023-01-01T00:00:00Z"), now)).toBe("stale");
  });
});

describe("skillSignal (inactivity ≠ skill loss)", () => {
  it("never signals a fresh skill", () => {
    expect(
      skillSignal({ freshness: "fresh", qualifyingEvidence: 2, active: true, hasTarget: true }),
    ).toBeNull();
  });
  it("ignores inactive untargeted skills (avoids alert fatigue)", () => {
    expect(
      skillSignal({ freshness: "stale", qualifyingEvidence: 1, active: false, hasTarget: false }),
    ).toBeNull();
  });
  it("stale targeted skill → warning (never critical — absence of evidence is not decline)", () => {
    const s = skillSignal({
      freshness: "stale",
      qualifyingEvidence: 1,
      active: true,
      hasTarget: true,
    });
    expect(s).toEqual({ type: "skill_stale", severity: "warning" });
  });
  it("aging skill → informational", () => {
    expect(
      skillSignal({ freshness: "aging", qualifyingEvidence: 1, active: true, hasTarget: false }),
    ).toEqual({
      type: "skill_aging",
      severity: "info",
    });
  });
});

describe("opportunity severities", () => {
  it("daysUntil handles null and past deadlines", () => {
    expect(daysUntil(null, now)).toBeNull();
    expect(daysUntil(new Date("2026-06-22T00:00:00Z"), now)).toBe(7);
    expect(daysUntil(new Date("2026-06-10T00:00:00Z"), now)).toBeLessThan(0);
  });
  it("critical only when imminent AND a required requirement is unmet", () => {
    expect(deadlineSeverity({ daysUntil: 5, unmetRequired: 2, active: true })).toBe("critical");
    expect(deadlineSeverity({ daysUntil: 5, unmetRequired: 0, active: true })).toBe("attention");
    expect(deadlineSeverity({ daysUntil: 40, unmetRequired: 2, active: true })).toBeNull();
    expect(deadlineSeverity({ daysUntil: 5, unmetRequired: 2, active: false })).toBeNull();
  });
  it("gapSeverity scales with unmet count; none when fully covered", () => {
    expect(gapSeverity(0)).toBeNull();
    expect(gapSeverity(1)).toBe("attention");
    expect(gapSeverity(3)).toBe("warning");
  });
});

describe("week windows", () => {
  it("weekStart returns the Monday of the week (UTC)", () => {
    expect(weekStart(new Date("2026-06-17T10:00:00Z")).toISOString().slice(0, 10)).toBe(
      "2026-06-15",
    );
    expect(weekStart(new Date("2026-06-15T00:00:00Z")).toISOString().slice(0, 10)).toBe(
      "2026-06-15",
    );
    expect(weekStart(new Date("2026-06-14T23:00:00Z")).toISOString().slice(0, 10)).toBe(
      "2026-06-08",
    ); // Sunday
  });
  it("weekWindows gives contiguous current and previous weeks", () => {
    const w = weekWindows(new Date("2026-06-17T00:00:00Z"));
    expect(w.start.toISOString().slice(0, 10)).toBe("2026-06-15");
    expect(w.endExclusive.toISOString().slice(0, 10)).toBe("2026-06-22");
    expect(w.prevStart.toISOString().slice(0, 10)).toBe("2026-06-08");
    expect(w.prevEndExclusive.toISOString()).toBe(w.start.toISOString());
  });
});

describe("helpers", () => {
  it("describeDelta", () => {
    expect(describeDelta(3, 1)).toBe("up");
    expect(describeDelta(1, 3)).toBe("down");
    expect(describeDelta(2, 2)).toBe("flat");
  });
  it("dedupe keys are stable and distinct per condition", () => {
    expect(dedupeKey.skill("s1")).toBe("skill:s1");
    expect(dedupeKey.opportunityGap("o1")).toBe("opp-gap:o1");
    expect(dedupeKey.opportunityDeadline("o1")).toBe("opp-deadline:o1");
    expect(dedupeKey.opportunityGap("o1")).not.toBe(dedupeKey.opportunityDeadline("o1"));
  });
});
