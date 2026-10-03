import { describe, expect, it } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";

import { createEngineeringAnalyticsService } from "./engineering-analytics.service";

/**
 * Unit tests for the Engineering Analytics aggregation: reconciliation (total = Σ domains = Σ trend),
 * comparison-period states, and missing-data semantics. The two owner-scoped SQL aggregates are
 * stubbed so the pure composition logic is tested without a database.
 */

type DomainCount = {
  domain: string;
  in_period: number;
  prev: number;
  before: number;
  all_dated: number;
  base: number;
};

const DOMAINS = [
  "projects",
  "milestones",
  "evidence",
  "goals",
  "architecture",
  "experiments",
  "certifications",
] as const;

/** Build the 7-row counts matrix, overriding specific domains. */
function counts(overrides: Partial<Record<string, Partial<DomainCount>>> = {}): DomainCount[] {
  return DOMAINS.map((domain) => ({
    domain,
    in_period: 0,
    prev: 0,
    before: 0,
    all_dated: 0,
    base: 0,
    ...overrides[domain],
  }));
}

/** A db whose two $queryRaw calls return the counts matrix then the monthly totals, in order. */
function fakeDb(
  countRows: DomainCount[],
  monthly: { month: string; count: number }[],
): PrismaClient {
  const queue: unknown[] = [countRows, monthly];
  return { $queryRaw: () => Promise.resolve(queue.shift()) } as unknown as PrismaClient;
}

const CLOCK = () => new Date("2026-10-04T12:00:00Z");
const run = (db: PrismaClient, range = "90d") =>
  createEngineeringAnalyticsService(db, CLOCK).engineering({ userId: "u1", requestId: "r1" }, {
    range,
  } as never);

describe("engineering analytics", () => {
  it("reconciles: activity total = Σ domain buckets = Σ trend points", async () => {
    const db = fakeDb(
      counts({
        projects: { in_period: 3, before: 5, all_dated: 8, base: 10 },
        evidence: { in_period: 2, before: 1, all_dated: 3, base: 4 },
      }),
      [
        { month: "2026-09", count: 2 },
        { month: "2026-10", count: 3 },
      ],
    );
    const dto = await run(db);
    expect(dto.activity.value).toBe(5);
    const domainSum = (dto.byDomain.breakdown ?? []).reduce((s, b) => s + b.value, 0);
    expect(domainSum).toBe(5);
    const trendSum = (dto.trend.breakdown ?? []).reduce((s, b) => s + b.value, 0);
    expect(trendSum).toBe(5);
    expect(dto.activity.state).toBe("ok");
  });

  it("offers a previous-period comparison only when history exists before the period", async () => {
    const withHistory = await run(
      fakeDb(counts({ projects: { in_period: 3, prev: 2, before: 4, all_dated: 9, base: 9 } }), []),
    );
    expect(withHistory.activity.comparison).toEqual({
      state: "available",
      previousValue: 2,
      period: expect.objectContaining({ range: "custom" }),
    });

    const noHistory = await run(
      fakeDb(counts({ projects: { in_period: 3, prev: 0, before: 0, all_dated: 3, base: 3 } }), []),
    );
    expect(noHistory.activity.comparison?.state).toBe("unavailable");
  });

  it("marks an all-time comparison not applicable", async () => {
    const dto = await run(
      fakeDb(counts({ projects: { in_period: 5, all_dated: 5, base: 5 } }), []),
      "all",
    );
    expect(dto.activity.comparison?.state).toBe("not_applicable");
  });

  it("distinguishes no_data, insufficient_data and a real zero", async () => {
    const noData = await run(fakeDb(counts(), []));
    expect(noData.activity.state).toBe("no_data");
    expect(noData.activity.value).toBeNull();

    const insufficient = await run(
      fakeDb(counts({ projects: { in_period: 0, all_dated: 0, base: 7 } }), []),
    );
    expect(insufficient.activity.state).toBe("insufficient_data");

    const realZero = await run(
      fakeDb(counts({ projects: { in_period: 0, before: 4, all_dated: 4, base: 4 } }), []),
    );
    expect(realZero.activity.state).toBe("zero");
    expect(realZero.activity.value).toBe(0);
  });

  it("lists the unavailable integration metrics with their source and reason", async () => {
    const dto = await run(
      fakeDb(counts({ projects: { in_period: 1, all_dated: 1, base: 1 } }), []),
    );
    const keys = dto.integrations.map((m) => m.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "engineering.deployment_frequency",
        "engineering.lead_time",
        "engineering.change_failure_rate",
        "engineering.time_to_restore",
        "engineering.technical_debt_trend",
      ]),
    );
    for (const m of dto.integrations) {
      expect(m.reason.length).toBeGreaterThan(5);
      expect(m.source.length).toBeGreaterThan(0);
    }
  });

  it("reports per-domain record counts", async () => {
    const dto = await run(fakeDb(counts({ projects: { base: 10 }, goals: { base: 3 } }), []));
    expect(dto.recordCounts.projects).toBe(10);
    expect(dto.recordCounts.goals).toBe(3);
    expect(dto.recordCounts.certifications).toBe(0);
  });
});
