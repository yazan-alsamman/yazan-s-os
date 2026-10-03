import { describe, expect, it } from "vitest";

import { parseInput } from "@/lib/validation/parse";

import { toActivityItem } from "./activity.service";
import { dashboardFiltersSchema } from "./dashboard.schemas";
import { appliedFilterLabels, buildMonthlySeries, monthsBetween } from "./dashboard.service";
import {
  availableMetrics,
  getMetric,
  METRIC_CATALOGUE,
  metricDefinitionSchema,
} from "./metric-catalogue";
import { comparisonFor, deriveState, metricResult } from "./metric-result";
import { dateWhere, previousPeriod, resolvePeriod, timestampWhere } from "./period";

const NOW = new Date("2026-10-02T15:30:00Z");

describe("metric catalogue governance (05 Metric Governance)", () => {
  it("every metric has all governance fields and validates", () => {
    for (const metric of METRIC_CATALOGUE) {
      expect(metricDefinitionSchema.safeParse(metric).success, metric.key).toBe(true);
      for (const field of ["name", "definition", "formula", "frequency", "owner"] as const) {
        expect(metric[field].trim().length, `${metric.key}.${field}`).toBeGreaterThan(0);
      }
      expect(metric.source.length, `${metric.key}.source`).toBeGreaterThan(0);
      expect(metric.caveats.length, `${metric.key}.caveats`).toBeGreaterThan(0);
    }
  });

  it("has unique keys; available metrics have drill-downs; unavailable ones explain why and when", () => {
    expect(new Set(METRIC_CATALOGUE.map((m) => m.key)).size).toBe(METRIC_CATALOGUE.length);
    for (const metric of METRIC_CATALOGUE) {
      if (metric.availability.status === "available") {
        expect(metric.drillDown, metric.key).not.toBeNull();
      } else {
        expect(metric.availability.reason.length).toBeGreaterThan(10);
        expect(metric.availability.plannedPhase.length).toBeGreaterThan(0);
      }
    }
    expect(availableMetrics()).toHaveLength(80);
    expect(METRIC_CATALOGUE).toHaveLength(89);
  });

  it("covers every 00 §4 KPI strip item, available or explicitly unavailable", () => {
    for (const key of [
      "projects.active",
      "projects.completed_in_period",
      "projects.production",
      "goals.active",
      "skills.coverage",
      "skills.critical_gaps",
      "ai.experiments",
      "architecture.decisions",
      "evidence.total",
      "engineering.technical_debt_trend",
    ]) {
      expect(getMetric(key).specRef).toMatch(/00 §4/);
    }
  });

  it("refuses to compute an unavailable metric", () => {
    expect(() =>
      metricResult("skills.learning_velocity", {
        value: 1,
        hasBaseRecords: true,
        noDataReason: "x",
      }),
    ).toThrow(/unavailable/);
  });
});

describe("periods", () => {
  it("resolves presets as inclusive UTC calendar days ending today", () => {
    const p = resolvePeriod({ range: "30d" }, NOW);
    expect(p.start?.toISOString()).toBe("2026-09-03T00:00:00.000Z");
    expect(p.end?.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(p.days).toBe(30);
    expect(timestampWhere(p)?.lt?.toISOString()).toBe("2026-10-03T00:00:00.000Z");
  });

  it("resolves custom ranges and the equal-length previous period", () => {
    const p = resolvePeriod(
      {
        range: "custom",
        from: new Date("2026-01-01T00:00:00Z"),
        to: new Date("2026-01-31T00:00:00Z"),
      },
      NOW,
    );
    expect(p.days).toBe(31);
    const prev = previousPeriod(p)!;
    expect(prev.end?.toISOString()).toBe("2025-12-31T00:00:00.000Z");
    expect(prev.start?.toISOString()).toBe("2025-12-01T00:00:00.000Z");
  });

  it("all-time has no bounds and no previous period", () => {
    const p = resolvePeriod({ range: "all" }, NOW);
    expect(dateWhere(p)).toBeUndefined();
    expect(previousPeriod(p)).toBeNull();
  });

  it("validates filters", () => {
    expect(parseInput(dashboardFiltersSchema, {}).range).toBe("90d");
    expect(dashboardFiltersSchema.safeParse({ range: "custom" }).success).toBe(false);
    expect(
      dashboardFiltersSchema.safeParse({ range: "custom", from: "2026-02-01", to: "2026-01-01" })
        .success,
    ).toBe(false);
    expect(dashboardFiltersSchema.safeParse({ projectHealth: "excellent" }).success).toBe(false);
    expect(dashboardFiltersSchema.safeParse({ userId: "someone-else" }).success).toBe(true);
    expect(parseInput(dashboardFiltersSchema, { userId: "x" })).not.toHaveProperty("userId");
  });

  it("labels applied filters per section", () => {
    const labels = appliedFilterLabels(
      parseInput(dashboardFiltersSchema, {
        projectHealth: "at_risk",
        evidenceVerified: "true",
        skillCategory: "AI",
      }),
    );
    expect(labels).toEqual({
      projects: ["Health: At risk"],
      evidence: ["Verified only"],
      skills: ["Category: AI"],
    });
  });
});

describe("metric states never conflate zero and missing data", () => {
  it.each([
    [{ value: 0, hasBaseRecords: false }, "no_data"],
    [{ value: 0, hasBaseRecords: true }, "zero"],
    [{ value: 3, hasBaseRecords: true }, "ok"],
    [{ value: 0, hasBaseRecords: true, insufficientReason: "No dates" }, "insufficient_data"],
  ] as const)("%o → %s", (input, state) => {
    expect(deriveState(input)).toBe(state);
  });

  it("returns null values for no_data / insufficient_data and keeps the reason", () => {
    const none = metricResult("projects.total", {
      value: 0,
      hasBaseRecords: false,
      noDataReason: "No projects yet.",
    });
    expect(none).toMatchObject({ value: null, state: "no_data", stateReason: "No projects yet." });
    const zero = metricResult("projects.total", {
      value: 0,
      hasBaseRecords: true,
      noDataReason: "x",
    });
    expect(zero).toMatchObject({ value: 0, state: "zero", stateReason: null });
  });

  it("only offers comparisons when they are valid", () => {
    const period = {
      range: "custom" as const,
      from: "2026-01-01",
      to: "2026-01-31",
      days: 31,
      label: "x",
    };
    expect(
      comparisonFor({ previous: null, hasHistoryBeforePeriod: true, entityLabel: "e" }).state,
    ).toBe("not_applicable");
    expect(
      comparisonFor({
        previous: { value: 0, period },
        hasHistoryBeforePeriod: false,
        entityLabel: "e",
      }),
    ).toMatchObject({
      state: "unavailable",
      reason: expect.stringContaining("Comparison unavailable"),
    });
    expect(
      comparisonFor({
        previous: { value: 4, period },
        hasHistoryBeforePeriod: true,
        entityLabel: "e",
      }),
    ).toMatchObject({
      state: "available",
      previousValue: 4,
    });
  });

  it("point-in-time metrics never carry a period or comparison", () => {
    const result = metricResult("evidence.total", {
      value: 2,
      hasBaseRecords: true,
      noDataReason: "x",
      comparison: { state: "not_applicable", reason: "x" },
    });
    expect(result.period).toBeNull();
    expect(result.comparison).toBeNull();
  });
});

describe("monthly evidence series", () => {
  it("fills empty months inside the range with real zeros", () => {
    const { points } = buildMonthlySeries(
      [
        { month: "2026-01", verified: true, count: 2 },
        { month: "2026-03", verified: false, count: 1 },
      ],
      { start: new Date("2026-01-15T00:00:00Z"), end: new Date("2026-03-02T00:00:00Z") },
    );
    expect(points).toEqual([
      { month: "2026-01", verified: 2, unverified: 0 },
      { month: "2026-02", verified: 0, unverified: 0 },
      { month: "2026-03", verified: 0, unverified: 1 },
    ]);
  });

  it("is empty (not a zero line) for all-time with no dated evidence, and bounded otherwise", () => {
    expect(buildMonthlySeries([], null)).toEqual({ points: [], truncated: false });
    const long = buildMonthlySeries([], {
      start: new Date("2000-01-01T00:00:00Z"),
      end: new Date("2026-01-01T00:00:00Z"),
    });
    expect(long.truncated).toBe(true);
    expect(long.points).toHaveLength(120);
    expect(
      monthsBetween(new Date("2025-11-01T00:00:00Z"), new Date("2026-02-01T00:00:00Z")),
    ).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("activity transformation", () => {
  const at = new Date("2026-10-01T10:00:00Z");
  const row = (over: Partial<Parameters<typeof toActivityItem>[0]>) => ({
    id: "a1",
    action: "project.created",
    entityType: "project",
    entityId: "p1",
    before: null,
    after: { name: "Platform", description: "secret-ish text", slug: "platform" },
    createdAt: at,
    ...over,
  });

  it("extracts only whitelisted label fields and links existing records", () => {
    const item = toActivityItem(row({}), () => true);
    expect(item).toEqual({
      id: "a1",
      at: at.toISOString(),
      entityType: "project",
      verb: "created",
      summary: "Created project",
      label: "Platform",
      href: "/projects/p1",
      deleted: false,
    });
    expect(JSON.stringify(item)).not.toContain("secret-ish");
  });

  it("marks deleted records and never links them", () => {
    const item = toActivityItem(
      row({ action: "project.deleted", after: null, before: { name: "Gone" } }),
      () => false,
    );
    expect(item).toMatchObject({
      summary: "Deleted project",
      label: "Gone",
      href: null,
      deleted: true,
    });
  });

  it("maps imports, exports, relationships and unknown entities safely", () => {
    expect(
      toActivityItem(
        row({
          action: "import_record.accepted",
          entityType: "import_record",
          after: { jobId: "j1", entityType: "skill" },
        }),
        () => true,
      ),
    ).toMatchObject({
      summary: "Accepted import record",
      href: "/settings/import/j1",
    });
    expect(
      toActivityItem(
        row({
          action: "export.generated",
          entityType: "export",
          entityId: null,
          after: { format: "json", counts: {} },
        }),
        () => false,
      ),
    ).toMatchObject({
      summary: "Generated data export",
      label: "json",
      href: "/settings/export",
    });
    expect(
      toActivityItem(row({ action: "skill.relations_updated", entityType: "skill" }), () => true)
        .summary,
    ).toBe("Changed links of skill");
    expect(toActivityItem(row({ entityType: "mystery" }), () => true)).toMatchObject({
      entityType: "other",
      href: null,
      label: null,
    });
  });

  it("labels relation-only changes with the record's current name", () => {
    const item = toActivityItem(
      row({
        action: "skill.relations_updated",
        entityType: "skill",
        entityId: "s1",
        after: { evidenceIds: ["e1"] },
      }),
      () => true,
      undefined,
      (id) => (id === "s1" ? "Distributed systems" : null),
    );
    expect(item).toMatchObject({ label: "Distributed systems", href: "/skills/s1" });
    expect(JSON.stringify(item)).not.toContain("e1");
  });
});
