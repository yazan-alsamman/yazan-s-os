import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getDb } from "@/lib/db/client";
import { parseInput } from "@/lib/validation/parse";
import { createActivityService } from "@/modules/analytics/activity.service";
import {
  activityQuerySchema,
  dashboardFiltersSchema,
  timelineQuerySchema,
} from "@/modules/analytics/dashboard.schemas";
import { createDashboardService } from "@/modules/analytics/dashboard.service";
import { createTimelineService } from "@/modules/analytics/timeline.service";
import {
  createCertificationSchema,
  listCertificationsQuerySchema,
} from "@/modules/certifications/certification.schemas";
import { createCertificationService } from "@/modules/certifications/certification.service";
import { createEvidenceSchema, listEvidenceQuerySchema } from "@/modules/evidence/evidence.schemas";
import { createEvidenceService } from "@/modules/evidence/evidence.service";
import { createProjectSchema, listProjectsQuerySchema } from "@/modules/projects/project.schemas";
import { createProjectService } from "@/modules/projects/project.service";
import { createSkillSchema, listSkillsQuerySchema } from "@/modules/skills/skill.schemas";
import { createSkillService } from "@/modules/skills/skill.service";

import { contextFor, createTestUser, truncateAll } from "./database";

const db = getDb();
const dashboard = createDashboardService(db);
const NOW = new Date("2026-10-02T12:00:00Z");
const filters = (input: Record<string, string> = {}) => parseInput(dashboardFiltersSchema, input);

/** Synthetic fixture portfolio (test database only). */
async function seed(label: string) {
  const ctx = contextFor(await createTestUser(label));
  const projects = createProjectService(db);
  const skills = createSkillService(db);
  const evidence = createEvidenceService(db);
  const certs = createCertificationService(db);
  const p = (input: Record<string, unknown>) =>
    projects.create(ctx, parseInput(createProjectSchema, input));
  await p({ name: `${label} A`, status: "development", healthStatus: "on_track" });
  await p({ name: `${label} B`, status: "validation", healthStatus: "blocked" });
  await p({
    name: `${label} C`,
    status: "production",
    healthStatus: "at_risk",
    startDate: "2026-01-01",
    completedAt: "2026-09-20",
  });
  await p({ name: `${label} D`, status: "archived", completedAt: "2025-03-01" });
  await p({ name: `${label} E`, status: "idea" });
  const s1 = await skills.create(
    ctx,
    parseInput(createSkillSchema, { name: `${label} TS`, category: "Languages", targetLevel: 4 }),
  );
  await skills.create(
    ctx,
    parseInput(createSkillSchema, { name: `${label} Go`, category: "Languages" }),
  );
  await skills.create(ctx, parseInput(createSkillSchema, { name: `${label} Old`, active: false }));
  const e = (input: Record<string, unknown>) =>
    evidence.create(ctx, parseInput(createEvidenceSchema, input));
  const e1 = await e({
    type: "repository",
    title: `${label} repo`,
    date: "2026-09-10",
    verified: true,
  });
  await e({ type: "document", title: `${label} doc`, date: "2026-08-01", verified: true });
  await e({ type: "document", title: `${label} old doc`, date: "2026-05-01", verified: true });
  await e({ type: "demo", title: `${label} demo`, date: "2026-09-25" });
  await e({ type: "other", title: `${label} undated` });
  await skills.replaceEvidence(ctx, s1.id, [{ evidenceId: e1.id, strength: "strong", date: null }]);
  const c = (input: Record<string, unknown>) =>
    certs.create(ctx, parseInput(createCertificationSchema, input));
  await c({ name: `${label} valid`, issuer: "I", expiryDate: "2028-01-01" });
  await c({ name: `${label} expiring`, issuer: "I", expiryDate: "2026-11-15" });
  await c({ name: `${label} expired`, issuer: "I", expiryDate: "2026-01-01" });
  await c({ name: `${label} forever`, issuer: "I" });
  await c({ name: `${label} revoked`, issuer: "I", expiryDate: "2026-11-01", status: "revoked" });
  return ctx;
}

const value = (m: { value: number | null }) => m.value;

describe("Command Center analytics (real PostgreSQL)", () => {
  beforeEach(truncateAll);
  afterAll(() => db.$disconnect());

  it("a brand-new user gets explicit no-data states, never fabricated zeros", async () => {
    const ctx = contextFor(await createTestUser("empty"));
    const d = await dashboard.dashboard(ctx, filters(), NOW);
    expect(d.hasAnyData).toBe(false);
    for (const kpi of d.kpis) {
      expect(kpi.state, kpi.key).toBe("no_data");
      expect(kpi.value, kpi.key).toBeNull();
    }
    expect(d.evidence.monthly.points).toHaveLength(4); // 2026-07-05..2026-10-02 spans 4 calendar months of real zeros…
    expect(d.evidence.velocity.state).toBe("no_data"); // …but the metric itself reports no data
  });

  it("computes every KPI and distribution from persisted records", async () => {
    const ctx = await seed("alice");
    const d = await dashboard.dashboard(ctx, filters(), NOW);
    expect(d.hasAnyData).toBe(true);
    expect(value(d.projects.total)).toBe(5);
    expect(value(d.projects.active)).toBe(2); // development + validation
    expect(value(d.projects.production)).toBe(1);
    expect(value(d.projects.completed)).toBe(1); // 2026-09-20 within last 90 days
    expect(d.projects.health.breakdown).toEqual([
      { key: "on_track", label: "On track", value: 1 },
      { key: "at_risk", label: "At risk", value: 1 },
      { key: "blocked", label: "Blocked", value: 1 },
      { key: "not_assessed", label: "Not assessed", value: 2 },
    ]);
    expect(d.projects.attention.map((p) => p.healthStatus)).toEqual(["at_risk", "blocked"]);

    expect(value(d.evidence.total)).toBe(5);
    expect(value(d.evidence.verified)).toBe(3);
    expect(value(d.evidence.velocity)).toBe(2); // verified & dated within 2026-07-05..2026-10-02
    expect(d.evidence.velocity.comparison).toMatchObject({ state: "available", previousValue: 1 });
    expect(value(d.evidence.undated)).toBe(1);
    expect(d.evidence.monthly.points.find((p) => p.month === "2026-09")).toEqual({
      month: "2026-09",
      verified: 1,
      unverified: 1,
    });

    expect(value(d.skills.total)).toBe(3);
    expect(value(d.skills.active)).toBe(2);
    expect(value(d.skills.withTarget)).toBe(1);
    expect(value(d.skills.withEvidence)).toBe(1);
    expect(value(d.skills.withoutEvidence)).toBe(1);
    expect(d.skills.byCategory.breakdown).toEqual([
      { key: "Languages", label: "Languages", value: 2 },
      { key: "__none__", label: "Uncategorised", value: 1 },
    ]);
    expect(d.skills.top[0]).toMatchObject({
      name: "alice TS",
      evidenceCount: 1,
      latestEvidenceDate: "2026-09-10",
    });

    expect(value(d.certifications.total)).toBe(5);
    expect(value(d.certifications.expiring)).toBe(1); // revoked one is excluded
    expect(d.certifications.expiry.breakdown?.map((b) => b.value)).toEqual([1, 1, 1, 1]);
    expect(d.certifications.attention.map((c) => c.name)).toEqual([
      "alice expired",
      "alice expiring",
    ]);
  });

  it("filters narrow the right sections and are reported as applied", async () => {
    const ctx = await seed("alice");
    const d = await dashboard.dashboard(
      ctx,
      filters({ projectHealth: "at_risk", evidenceType: "document", skillCategory: "languages" }),
      NOW,
    );
    expect(value(d.projects.total)).toBe(1);
    expect(value(d.projects.active)).toBe(0);
    expect(d.projects.active.state).toBe("zero");
    expect(value(d.evidence.total)).toBe(2);
    expect(value(d.skills.total)).toBe(2);
    expect(d.filters).toEqual({
      projects: ["Health: At risk"],
      evidence: ["Type: Document"],
      skills: ["Category: languages"],
    });
    expect(d.projects.total.filtersApplied).toEqual(["Health: At risk"]);
  });

  it("date range changes period metrics only; all-time disables comparisons", async () => {
    const ctx = await seed("alice");
    const all = await dashboard.dashboard(ctx, filters({ range: "all" }), NOW);
    expect(value(all.projects.completed)).toBe(2);
    expect(value(all.evidence.velocity)).toBe(3);
    expect(all.evidence.velocity.comparison?.state).toBe("not_applicable");
    expect(value(all.evidence.total)).toBe(5);

    const thirty = await dashboard.dashboard(ctx, filters({ range: "30d" }), NOW);
    expect(value(thirty.evidence.velocity)).toBe(1);
    const custom = await dashboard.dashboard(
      ctx,
      filters({ range: "custom", from: "2025-01-01", to: "2025-01-31" }),
      NOW,
    );
    expect(custom.evidence.velocity.comparison).toMatchObject({ state: "unavailable" });
  });

  it("reports insufficient data instead of zero when the required attribute is missing", async () => {
    const ctx = contextFor(await createTestUser("nodates"));
    await createEvidenceService(db).create(
      ctx,
      parseInput(createEvidenceSchema, { type: "other", title: "undated", verified: true }),
    );
    await createProjectService(db).create(
      ctx,
      parseInput(createProjectSchema, { name: "No completion" }),
    );
    const d = await dashboard.dashboard(ctx, filters(), NOW);
    expect(d.evidence.velocity).toMatchObject({ state: "insufficient_data", value: null });
    expect(d.projects.completed).toMatchObject({ state: "insufficient_data", value: null });
    expect(d.evidence.total).toMatchObject({ state: "ok", value: 1 });
  });

  it("every drill-down list returns exactly the records its KPI counted", async () => {
    const ctx = await seed("alice");
    const d = await dashboard.dashboard(ctx, filters(), NOW);
    const projects = createProjectService(db);
    const total = async (q: Record<string, string>) =>
      (await projects.list(ctx, parseInput(listProjectsQuerySchema, q))).page.total;
    expect(await total({ lifecycle: "active" })).toBe(value(d.projects.active));
    expect(await total({ lifecycle: "production" })).toBe(value(d.projects.production));
    expect(await total({ completedFrom: d.period.from!, completedTo: d.period.to! })).toBe(
      value(d.projects.completed),
    );
    expect(await total({ healthStatus: "blocked" })).toBe(1);

    const ev = async (q: Record<string, string>) =>
      (await createEvidenceService(db).list(ctx, parseInput(listEvidenceQuerySchema, q))).page
        .total;
    expect(await ev({})).toBe(value(d.evidence.total));
    expect(await ev({ verified: "true" })).toBe(value(d.evidence.verified));
    expect(await ev({ verified: "true", dateFrom: d.period.from!, dateTo: d.period.to! })).toBe(
      value(d.evidence.velocity),
    );
    expect(await ev({ dated: "false" })).toBe(value(d.evidence.undated));

    const sk = async (q: Record<string, string>) =>
      (await createSkillService(db).list(ctx, parseInput(listSkillsQuerySchema, q))).page.total;
    expect(await sk({ hasEvidence: "true" })).toBe(value(d.skills.withEvidence));
    expect(await sk({ hasEvidence: "false", active: "true" })).toBe(
      value(d.skills.withoutEvidence),
    );

    const ce = async (q: Record<string, string>) =>
      (await createCertificationService(db).list(ctx, parseInput(listCertificationsQuerySchema, q)))
        .page.total;
    // The KPI excludes revoked certifications; its drill-down adds current=true to match exactly.
    expect(await ce({ expiry: "expiring", current: "true" })).toBe(
      value(d.certifications.expiring),
    );
    expect(await ce({ expiry: "expiring" })).toBe((value(d.certifications.expiring) ?? 0) + 1);
  });

  it("activity is derived from the caller's audit log, safely presented", async () => {
    const ctx = await seed("alice");
    const projects = createProjectService(db);
    const doomed = await projects.create(ctx, parseInput(createProjectSchema, { name: "Doomed" }));
    await projects.delete(ctx, doomed.id);
    await db.auditLog.create({
      data: {
        actorId: ctx.userId,
        action: "auth.session.created",
        entityType: "session",
        after: { userAgent: "UA" },
      },
    });

    const page = await createActivityService(db).list(
      ctx,
      parseInput(activityQuerySchema, { range: "all", pageSize: "50" }),
      new Date(),
    );
    expect(page.data[0]).toMatchObject({
      summary: "Deleted project",
      label: "Doomed",
      deleted: true,
      href: null,
    });
    expect(page.data.some((i) => i.entityType === "other")).toBe(false);
    expect(JSON.stringify(page)).not.toContain("UA");
    const created = page.data.find((i) => i.summary === "Created project" && i.label === "alice A");
    expect(created?.href).toMatch(/^\/projects\/[0-9a-f-]{36}$/);
    expect(page.page.total).toBeGreaterThan(20);
    expect(page.data.length).toBeLessThanOrEqual(50);
  });

  it("evidence timeline uses recorded dates only, with bounded related links", async () => {
    const ctx = await seed("alice");
    const t = await createTimelineService(db).list(ctx, parseInput(timelineQuerySchema, {}), NOW);
    expect(t.data.map((e) => e.date)).toEqual(["2026-09-25", "2026-09-10", "2026-08-01"]);
    expect(t.undatedCount).toBe(1);
    expect(t.data[1]?.related).toEqual([
      expect.objectContaining({ kind: "skill", label: "alice TS" }),
    ]);
    const verified = await createTimelineService(db).list(
      ctx,
      parseInput(timelineQuerySchema, { evidenceVerified: "true", range: "all", pageSize: "2" }),
      NOW,
    );
    expect(verified.page).toMatchObject({ total: 3, totalPages: 2 });
  });
});
