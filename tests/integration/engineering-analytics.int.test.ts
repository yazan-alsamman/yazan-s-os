import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDb } from "@/lib/db/client";
import { createEngineeringAnalyticsService } from "@/modules/analytics/engineering-analytics.service";
import { createPortfolioService } from "@/modules/analytics/portfolio.service";
import type { ServiceContext } from "@/modules/shared/service-context";

import { contextFor, createTestUser, truncateAll } from "./database";

/**
 * Phase 9 Engineering Analytics against the real database: reconciliation (total = Σ domains = Σ
 * trend, and = the authoritative portfolio metrics), date boundaries, comparison periods,
 * missing-data semantics and two-user isolation. All dates are relative to now so the test is
 * stable on any run date.
 */
const db = getDb();
const service = createEngineeringAnalyticsService(db);
const DAY = 86_400_000;
/** A whole UTC calendar day, `n` days before today. */
function daysAgo(n: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - n * DAY);
}

/** Seed one dated event in every domain for a user: 7 inside the last 90 days, 2 before. */
async function seedActivity(ctx: ServiceContext) {
  const uid = ctx.userId;
  const project = await db.project.create({
    data: {
      userId: uid,
      name: "In-period project",
      slug: `p-${crypto.randomUUID()}`,
      status: "production",
      completedAt: daysAgo(30),
    },
  });
  await db.project.create({
    data: {
      userId: uid,
      name: "Old project",
      slug: `p-${crypto.randomUUID()}`,
      status: "production",
      completedAt: daysAgo(200), // before the window (history, not previous period)
    },
  });
  await db.milestone.create({
    data: {
      userId: uid,
      projectId: project.id,
      title: "Done milestone",
      status: "completed",
      completedAt: daysAgo(20),
    },
  });
  await db.evidence.create({
    data: { userId: uid, type: "document", title: "In-period evidence", date: daysAgo(40) },
  });
  await db.evidence.create({
    data: { userId: uid, type: "document", title: "Previous-period evidence", date: daysAgo(150) },
  });
  await db.goal.create({
    data: {
      userId: uid,
      title: "Done goal",
      type: "quarterly_goal",
      status: "completed",
      completedAt: daysAgo(25),
    },
  });
  await db.architectureDecision.create({
    data: { userId: uid, title: "Accepted decision", status: "accepted", decidedAt: daysAgo(15) },
  });
  const experiment = await db.aIExperiment.create({
    data: { userId: uid, title: "Experiment" },
  });
  await db.experimentRun.create({
    data: {
      userId: uid,
      experimentId: experiment.id,
      runNumber: 1,
      status: "completed",
      runAt: daysAgo(10),
    },
  });
  await db.certification.create({
    data: { userId: uid, name: "Cert", issuer: "Issuer", issueDate: daysAgo(5) },
  });
}

describe("Phase 9 Engineering Analytics (service + database)", () => {
  let alice: ServiceContext;
  let bob: ServiceContext;

  beforeAll(async () => {
    await truncateAll();
    alice = contextFor(await createTestUser("eng-alice"));
    bob = contextFor(await createTestUser("eng-bob"));
    await seedActivity(alice);
    // Bob: a single in-period project completion.
    await db.project.create({
      data: {
        userId: bob.userId,
        name: "Bob project",
        slug: `p-${crypto.randomUUID()}`,
        status: "production",
        completedAt: daysAgo(10),
      },
    });
  });

  afterAll(truncateAll);

  it("counts seven in-period events and reconciles total = Σ domains = Σ trend", async () => {
    const dto = await service.engineering(alice, { range: "90d" } as never);
    expect(dto.activity.value).toBe(7);
    const domainSum = (dto.byDomain.breakdown ?? []).reduce((s, b) => s + b.value, 0);
    const trendSum = (dto.trend.breakdown ?? []).reduce((s, b) => s + b.value, 0);
    expect(domainSum).toBe(7);
    expect(trendSum).toBe(7);
    // Each of the seven domains contributed exactly one in-period event.
    for (const b of dto.byDomain.breakdown ?? []) expect(b.value).toBe(1);
  });

  it("offers a previous-period comparison grounded in real history", async () => {
    const dto = await service.engineering(alice, { range: "90d" } as never);
    // The 150-days-ago evidence falls in the previous 90-day period.
    expect(dto.activity.comparison).toMatchObject({ state: "available", previousValue: 1 });
  });

  it("includes events on the inclusive custom-range boundaries and excludes those outside", async () => {
    const dto = await service.engineering(alice, {
      range: "custom",
      from: daysAgo(40), // the in-period evidence (inclusive start)
      to: daysAgo(25), // the completed goal (inclusive end)
    } as never);
    // In [40..25] days ago: evidence(40), project(30), goal(25). milestone(20) and later are out.
    expect(dto.activity.value).toBe(3);
  });

  it("reconciles with the authoritative portfolio metrics", async () => {
    const filters = { range: "90d" } as never;
    const eng = await service.engineering(alice, filters);
    const portfolio = await createPortfolioService(db).portfolio(alice, filters);
    const domain = (key: string) =>
      (eng.byDomain.breakdown ?? []).find((b) => b.key === key)?.value ?? 0;
    const deliverySum = (portfolio.deliveryTrend.breakdown ?? []).reduce((s, p) => s + p.value, 0);
    expect(domain("projects")).toBe(deliverySum);
    expect(domain("milestones")).toBe(portfolio.milestones.completedInPeriod.value);
  });

  it("isolates users (Bob sees only his own activity)", async () => {
    const dto = await service.engineering(bob, { range: "90d" } as never);
    expect(dto.activity.value).toBe(1);
    expect(dto.recordCounts.projects).toBe(1);
    expect(dto.recordCounts.certifications).toBe(0);
  });

  it("distinguishes no_data from insufficient_data", async () => {
    const fresh = contextFor(await createTestUser("eng-fresh"));
    const noData = await service.engineering(fresh, { range: "90d" } as never);
    expect(noData.activity.state).toBe("no_data");

    const undated = contextFor(await createTestUser("eng-undated"));
    await db.project.create({
      data: {
        userId: undated.userId,
        name: "Undated",
        slug: `p-${crypto.randomUUID()}`,
        status: "idea",
      },
    });
    const insufficient = await service.engineering(undated, { range: "90d" } as never);
    expect(insufficient.activity.state).toBe("insufficient_data");
  });
});
