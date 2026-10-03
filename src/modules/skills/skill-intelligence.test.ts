import { describe, expect, it } from "vitest";

import { getMetric } from "@/modules/analytics/metric-catalogue";
import { deliveryRate } from "@/modules/projects/project-health";

import { levelModelInputSchema } from "./level-model.service";
import { CANONICAL_LEVEL_VALUES, DEFAULT_LEVEL_MODEL, isValidLevel } from "./level-models";
import {
  analyseSkill,
  deriveLevel,
  emptySignals,
  freshness,
  gapAnalysis,
  trend,
  type SkillSignals,
} from "./skill-intelligence";
import { matchesQuery, sortRows, type SkillIntelligenceRow } from "./skill-intelligence.service";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const NOW = new Date("2026-10-03T15:00:00Z");

type Patch = {
  [K in keyof SkillSignals]?: Partial<SkillSignals[K]>;
};
const sig = (p: Patch = {}): SkillSignals => {
  const s = emptySignals();
  return {
    evidence: { ...s.evidence, ...p.evidence },
    projects: { ...s.projects, ...p.projects },
    certifications: { ...s.certifications, ...p.certifications },
    demonstrations: { ...s.demonstrations, ...p.demonstrations },
  };
};

describe("skill-level-v1 (evidence-derived level)", () => {
  it("no linked record → no level (never 0), state no_evidence", () => {
    expect(deriveLevel(sig())).toMatchObject({ state: "no_evidence", level: null });
  });

  it("records that qualify for nothing → insufficient_evidence", () => {
    expect(deriveLevel(sig(), true)).toMatchObject({ state: "insufficient_evidence", level: null });
  });

  it("any record → 1; weak evidence alone stays 1", () => {
    expect(deriveLevel(sig({ evidence: { total: 3 } })).level).toBe(1);
    expect(deriveLevel(sig({ certifications: { inProgress: 1 } })).level).toBe(1);
  });

  it("certification or project association alone caps at 2", () => {
    expect(deriveLevel(sig({ certifications: { earned: 5 } })).level).toBe(2);
    expect(deriveLevel(sig({ projects: { total: 9, delivered: 9, production: 9 } })).level).toBe(2);
  });

  it("level 3 needs 2 moderate/strong evidence (1 verified) and a delivered project", () => {
    const base = { evidence: { total: 2, qualifying: 2, qualifyingVerified: 1 } };
    expect(deriveLevel(sig(base)).level).toBe(2);
    expect(deriveLevel(sig({ ...base, projects: { total: 1, delivered: 1 } })).level).toBe(3);
    expect(
      deriveLevel(
        sig({
          evidence: { total: 2, qualifying: 2, qualifyingVerified: 0 },
          projects: { total: 1, delivered: 1 },
        }),
      ).level,
    ).toBe(2);
  });

  it("level 4 needs strong + verified evidence and a production-linked record; cumulative ladder", () => {
    const l4 = sig({
      evidence: { total: 3, qualifying: 3, qualifyingVerified: 2, strong: 1 },
      projects: { total: 1, delivered: 1, production: 1 },
    });
    expect(deriveLevel(l4).level).toBe(4);
    // Production metric evidence counts as production-linked…
    const viaMetric = sig({
      evidence: { total: 3, qualifying: 3, qualifyingVerified: 2, strong: 1, productionMetric: 1 },
      projects: { total: 1, delivered: 1 },
    });
    expect(deriveLevel(viaMetric).level).toBe(4);
    // …but without a delivered project the level-3 rule fails, so level 4 is not reached.
    const noProject = sig({
      evidence: { total: 3, qualifying: 3, qualifyingVerified: 2, strong: 1, productionMetric: 1 },
    });
    expect(deriveLevel(noProject).level).toBe(2);
  });

  it("level 5 needs recognition (testimonial/publication) on top of level 4", () => {
    const strong = {
      total: 6,
      qualifying: 6,
      qualifyingVerified: 4,
      strong: 3,
      strongVerified: 2,
    };
    const projects = { total: 2, delivered: 2, production: 2 };
    expect(deriveLevel(sig({ evidence: strong, projects })).level).toBe(4);
    expect(deriveLevel(sig({ evidence: { ...strong, recognition: 1 }, projects })).level).toBe(5);
  });

  it("explains every rule and the missing requirements of the next level", () => {
    const r = deriveLevel(sig({ evidence: { total: 2, qualifying: 2, qualifyingVerified: 1 } }));
    expect(r.rules).toHaveLength(5);
    expect(r.nextLevel).toMatchObject({
      level: 3,
      missing: [
        expect.objectContaining({ label: "Linked projects in delivery", required: 1, actual: 0 }),
      ],
    });
    expect(r.explanation).toContain("2 evidence links");
  });

  it("is deterministic: identical signals give identical results", () => {
    const s = sig({ evidence: { total: 4, qualifying: 3, qualifyingVerified: 2, strong: 1 } });
    expect(deriveLevel(s)).toEqual(deriveLevel(structuredClone(s)));
  });
});

describe("freshness-v1", () => {
  const withLatest = (date: string) =>
    sig({ evidence: { total: 1 }, demonstrations: { latest: d(date), dated: 1 } });

  it("same day and boundaries: 365 fresh, 366 aging, 730 aging, 731 stale", () => {
    expect(freshness(withLatest("2026-10-03"), NOW)).toMatchObject({
      state: "fresh",
      daysSince: 0,
    });
    expect(freshness(withLatest("2025-10-03"), NOW)).toMatchObject({
      state: "fresh",
      daysSince: 365,
    });
    expect(freshness(withLatest("2025-10-02"), NOW)).toMatchObject({
      state: "aging",
      daysSince: 366,
    });
    expect(freshness(withLatest("2024-10-03"), NOW)).toMatchObject({
      state: "aging",
      daysSince: 730,
    });
    expect(freshness(withLatest("2024-10-02"), NOW)).toMatchObject({
      state: "stale",
      daysSince: 731,
    });
  });

  it("uses the UTC day: the hour of evaluation does not change the result", () => {
    const s = withLatest("2025-10-03");
    expect(freshness(s, new Date("2026-10-03T00:00:00Z"))).toEqual(
      freshness(s, new Date("2026-10-03T23:59:59Z")),
    );
    expect(freshness(s, new Date("2026-10-04T00:00:00Z")).state).toBe("aging");
  });

  it("undated or future-only evidence never establishes recency; no evidence is distinct", () => {
    expect(
      freshness(sig({ evidence: { total: 2 }, demonstrations: { undated: 2 } }), NOW),
    ).toMatchObject({
      state: "no_dated_evidence",
      latest: null,
    });
    expect(
      freshness(sig({ evidence: { total: 1 }, demonstrations: { future: 1 } }), NOW).explanation,
    ).toContain("1 dated in the future, ignored");
    expect(freshness(sig(), NOW).state).toBe("no_evidence");
  });
});

describe("skill-trend-v1", () => {
  const t = (p: Partial<SkillSignals["demonstrations"]>) =>
    trend(sig({ evidence: { total: 5 }, demonstrations: p }), NOW);

  it("insufficient with < 2 dated demonstrations or no history older than 12 months", () => {
    expect(t({ dated: 1, earliest: d("2020-01-01") }).state).toBe("insufficient_history");
    expect(t({ dated: 5, earliest: d("2026-01-01"), recentWindow: 5 }).state).toBe(
      "insufficient_history",
    );
  });

  it("compares the last 12 months with the 12 before", () => {
    const old = { dated: 6, earliest: d("2023-01-01") };
    expect(t({ ...old, recentWindow: 3, previousWindow: 1 }).state).toBe("increasing");
    expect(t({ ...old, recentWindow: 2, previousWindow: 2 }).state).toBe("stable");
    expect(t({ ...old, recentWindow: 0, previousWindow: 2 }).state).toBe("decreasing");
    // Sparse history (two demonstrations years ago, nothing in 24 months) is not "stable".
    expect(
      t({ dated: 2, earliest: d("2021-01-01"), recentWindow: 0, previousWindow: 0 }).state,
    ).toBe("insufficient_history");
  });
});

describe("gap-analysis-v1", () => {
  const derived = (level: number | null) =>
    level === null
      ? deriveLevel(sig())
      : { ...deriveLevel(sig({ evidence: { total: 1 } })), level };
  const fresh = freshness(
    sig({ evidence: { total: 1 }, demonstrations: { latest: d("2026-09-01"), dated: 1 } }),
    NOW,
  );
  const stale = freshness(
    sig({ evidence: { total: 1 }, demonstrations: { latest: d("2020-01-01"), dated: 1 } }),
    NOW,
  );
  const g = (target: number | null, level: number | null, f = fresh, active = true) =>
    gapAnalysis({ active, targetLevel: target, derived: derived(level), freshness: f });

  it("below, at and above target", () => {
    expect(g(4, 3)).toMatchObject({ state: "below_target", gap: 1, critical: false });
    expect(g(3, 3)).toMatchObject({ state: "at_target", gap: 0, critical: false });
    expect(g(2, 4)).toMatchObject({ state: "above_target", gap: -2, critical: false });
  });

  it("no target, target 0, and no derivable level are explicit — never a numeric gap", () => {
    expect(g(null, 3)).toMatchObject({ state: "no_target", gap: null });
    expect(g(0, 3)).toMatchObject({ state: "no_target", gap: null });
    expect(g(4, null)).toMatchObject({
      state: "not_computable",
      gap: null,
      critical: false,
      targetWithoutEvidence: true,
    });
  });

  it("critical: ≥ 2 below target, or below target with stale evidence; active skills only", () => {
    expect(g(5, 3).critical).toBe(true);
    expect(g(4, 3, stale).critical).toBe(true);
    expect(g(4, 4, stale).critical).toBe(false);
    expect(g(5, 3, fresh, false).critical).toBe(false);
  });
});

describe("level models (ADR 0026)", () => {
  const levels = CANONICAL_LEVEL_VALUES.map((value) => ({ value, label: `L${value}` }));

  it("the default model is the 01 §6 scale with rule descriptions", () => {
    expect(DEFAULT_LEVEL_MODEL.levels.map((l) => l.label)).toEqual([
      "Not evaluated",
      "Awareness",
      "Working knowledge",
      "Independent",
      "Advanced",
      "Expert / can lead",
    ]);
    expect(DEFAULT_LEVEL_MODEL.levels.every((l) => l.description)).toBe(true);
  });

  it("custom models must define exactly values 0–5 in order with non-blank labels", () => {
    expect(levelModelInputSchema.safeParse({ name: "Mine", levels }).success).toBe(true);
    expect(
      levelModelInputSchema.safeParse({ name: "Mine", levels: levels.slice(0, 5) }).success,
    ).toBe(false);
    expect(
      levelModelInputSchema.safeParse({ name: "Mine", levels: [...levels].reverse() }).success,
    ).toBe(false);
    expect(
      levelModelInputSchema.safeParse({
        name: "Mine",
        levels: levels.map((l, i) => (i === 2 ? { ...l, label: "  " } : l)),
      }).success,
    ).toBe(false);
    expect(
      levelModelInputSchema.safeParse({
        name: "Mine",
        levels: levels.map((l) => ({ ...l, value: l.value + 1 })),
      }).success,
    ).toBe(false);
  });

  it("targets are validated against the canonical values for default and custom models", () => {
    expect(isValidLevel("peos-default-v1", 5)).toBe(true);
    expect(isValidLevel("peos-default-v1", 6)).toBe(false);
    expect(isValidLevel("custom", 0)).toBe(true);
    expect(isValidLevel("custom", 7)).toBe(false);
    expect(isValidLevel("unknown", 1)).toBe(false);
  });
});

describe("source-list predicate and ordering", () => {
  const row = (over: Partial<SkillIntelligenceRow> & { name: string }): SkillIntelligenceRow =>
    ({
      id: over.name,
      category: null,
      active: true,
      levelModelName: "x",
      target: { level: 4, label: "Advanced" },
      current: { level: 3, label: "Independent", state: "derived" },
      gap: { state: "below_target", value: 1, critical: false, targetWithoutEvidence: false },
      freshness: { state: "fresh", latest: "2026-09-01", daysSince: 32 },
      trend: "stable",
      counts: {
        evidence: 1,
        verified: 1,
        projects: 1,
        certifications: 0,
        productionLinked: 0,
        undated: 0,
      },
      ...over,
    }) as SkillIntelligenceRow;

  it("filters by derived values exactly (hasTarget means target ≥ 1)", () => {
    expect(
      matchesQuery(row({ name: "a", target: { level: 0, label: "x" } }), { hasTarget: true }),
    ).toBe(false);
    expect(matchesQuery(row({ name: "a" }), { level: "3", freshness: "fresh" })).toBe(true);
    expect(
      matchesQuery(
        row({ name: "a", current: { level: null, label: null, state: "no_evidence" } }),
        { level: "none" },
      ),
    ).toBe(true);
  });

  it("sorts critical and largest gaps first, deterministically", () => {
    const sorted = sortRows(
      [
        row({ name: "b" }),
        row({
          name: "a",
          gap: { state: "below_target", value: 2, critical: true, targetWithoutEvidence: false },
        }),
        row({
          name: "c",
          gap: {
            state: "not_computable",
            value: null,
            critical: false,
            targetWithoutEvidence: true,
          },
        }),
      ],
      "gap",
    );
    expect(sorted.map((r) => r.name)).toEqual(["a", "b", "c"]);
  });

  it("analyseSkill combines level, freshness, trend and gap", () => {
    const a = analyseSkill({ active: true, targetLevel: 5 }, sig({ evidence: { total: 1 } }), NOW);
    expect(a.derived.level).toBe(1);
    expect(a.gap).toMatchObject({ state: "below_target", gap: 4, critical: true });
    expect(a.freshness.state).toBe("no_dated_evidence");
  });
});

describe("Phase 3 regression guard: delivery rate semantics are unchanged", () => {
  it("catalogue and implementation keep completed / (completed + overdue), version 2", () => {
    const m = getMetric("projects.delivery_rate");
    expect(m).toMatchObject({ version: 2, valueType: "ratio", temporal: "point_in_time" });
    expect(m.formula).toMatch(/^COUNT\(completed\) \/ \(COUNT\(completed\) \+ COUNT\(overdue\)\)/);
    expect(deliveryRate({ completed: 3, overdue: 1 })).toBe(0.75);
    expect(deliveryRate({ completed: 0, overdue: 0 })).toBeNull();
  });
});
