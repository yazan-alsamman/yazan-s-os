import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { bucketHref, metricHref } from "@/components/command-center/drilldown";
import { getDb } from "@/lib/db/client";
import { parseInput } from "@/lib/validation/parse";
import { createArchitectureAnalyticsService } from "@/modules/analytics/architecture-analytics.service";
import { dashboardFiltersSchema } from "@/modules/analytics/dashboard.schemas";
import { createDashboardService } from "@/modules/analytics/dashboard.service";
import { createArchitectureIntelligenceService } from "@/modules/architecture/architecture-intelligence";
import {
  alternativeSchema,
  createComponentSchema,
  createDecisionSchema,
  listComponentsQuerySchema,
  listDecisionsQuerySchema,
  mapQuerySchema,
  updateDecisionSchema,
} from "@/modules/architecture/architecture.schemas";
import { createComponentService } from "@/modules/architecture/component.service";
import { createDecisionService } from "@/modules/architecture/decision.service";
import { createEvidenceSchema } from "@/modules/evidence/evidence.schemas";
import { createEvidenceService } from "@/modules/evidence/evidence.service";
import { createProjectSchema, listProjectsQuerySchema } from "@/modules/projects/project.schemas";
import { createProjectService } from "@/modules/projects/project.service";
import { toDateOnly } from "@/modules/shared/fields";
import { createTechnologySchema } from "@/modules/technologies/technology.schemas";
import { createTechnologyService } from "@/modules/technologies/technology.service";

import { contextFor, createTestUser, truncateAll } from "./database";

/**
 * Phase 7 Architecture Intelligence on real PostgreSQL. Fixtures are created per test; every
 * analytical value is asserted against its source list (exact reconciliation).
 */
const db = getDb();
const decisions = createDecisionService(db);
const components = createComponentService(db);
const intel = createArchitectureIntelligenceService(db);
const analytics = createArchitectureAnalyticsService(db);
const projects = createProjectService(db);
const evidence = createEvidenceService(db);
const technologies = createTechnologyService(db);
type Ctx = ReturnType<typeof contextFor>;
const DAY = 86_400_000;
const day = (o: number) => toDateOnly(new Date(Date.now() + o * DAY))!;

const decision = (ctx: Ctx, input: Record<string, unknown>) =>
  decisions.create(ctx, parseInput(createDecisionSchema, input));
const update = (ctx: Ctx, id: string, input: Record<string, unknown>) =>
  decisions.update(ctx, id, parseInput(updateDecisionSchema, input));
const component = (ctx: Ctx, input: Record<string, unknown>) =>
  components.create(ctx, parseInput(createComponentSchema, input));
const project = (ctx: Ctx, name: string) =>
  projects.create(ctx, parseInput(createProjectSchema, { name }));
const decisionTotal = async (ctx: Ctx, q: Record<string, string>) =>
  (await intel.listDecisions(ctx, parseInput(listDecisionsQuerySchema, q))).page.total;
const componentTotal = async (ctx: Ctx, q: Record<string, string>) =>
  (await intel.listComponents(ctx, parseInput(listComponentsQuerySchema, q))).page.total;
const projectTotal = async (ctx: Ctx, q: Record<string, string>) =>
  (await projects.list(ctx, parseInput(listProjectsQuerySchema, q))).page.total;
const query = (href: string) =>
  Object.fromEntries(new URL(href, "http://x").searchParams.entries()) as Record<string, string>;

beforeEach(() => truncateAll());
afterAll(() => db.$disconnect());

describe("decision lifecycle, supersession and audit", () => {
  it("propose → accept → supersede → reinstate → delete, audited in order", async () => {
    const ctx = contextFor(await createTestUser("life"));
    const a = await decision(ctx, { title: "Fixture: Postgres for state" });
    expect(a.status).toBe("proposed");
    expect(a.decidedAt).toBeNull();
    const accepted = await update(ctx, a.id, { status: "accepted", decision: "Use Postgres" });
    expect(accepted.decidedAt).toBe(day(0));
    const b = await decision(ctx, { title: "Fixture: Postgres 17", status: "accepted" });
    const superseded = await update(ctx, a.id, { status: "superseded", supersededById: b.id });
    expect(superseded.supersededById).toBe(b.id);
    // The superseding decision cannot be deleted while it supersedes history.
    await expect(decisions.delete(ctx, b.id)).rejects.toMatchObject({ code: "CONFLICT" });
    const reinstated = await update(ctx, a.id, { status: "accepted" });
    expect(reinstated.supersededById).toBeNull();
    await decisions.delete(ctx, a.id);

    const actions = (
      await db.auditLog.findMany({
        where: { actorId: ctx.userId, entityId: a.id },
        orderBy: { createdAt: "asc" },
        select: { action: true },
      })
    ).map((r) => r.action);
    expect(actions).toEqual([
      "architecture_decision.created",
      "architecture_decision.accepted",
      "architecture_decision.superseded",
      "architecture_decision.restored",
      "architecture_decision.deleted",
    ]);
  });

  it("rejects illegal transitions, cycles, rejected superseders and future dates; DB enforces state", async () => {
    const ctx = contextFor(await createTestUser("rules"));
    const p = await decision(ctx, { title: "Fixture: proposal" });
    await expect(update(ctx, p.id, { status: "superseded" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    const a = await decision(ctx, { title: "Fixture A", status: "accepted" });
    const b = await decision(ctx, { title: "Fixture B", status: "accepted" });
    await update(ctx, a.id, { status: "superseded", supersededById: b.id });
    // B superseded by A would close the loop A → B → A.
    await expect(
      update(ctx, b.id, { status: "superseded", supersededById: a.id }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    const r = await decision(ctx, { title: "Fixture rejected", status: "rejected" });
    const c = await decision(ctx, { title: "Fixture C", status: "accepted" });
    await expect(
      update(ctx, c.id, { status: "superseded", supersededById: r.id }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(update(ctx, c.id, { decidedAt: day(30) })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    // Database invariant: a superseded row must name its successor.
    await expect(
      db.architectureDecision.update({ where: { id: c.id }, data: { status: "superseded" } }),
    ).rejects.toThrow(/architecture_decisions_superseded_chk/);
    await expect(
      db.architectureDecision.update({ where: { id: c.id }, data: { decidedAt: null } }),
    ).rejects.toThrow(/architecture_decisions_decided_at_chk/);
  });
});

describe("relationships reuse Projects, Evidence and Technologies without duplicating them", () => {
  it("deleting a project or technology removes only the link; decision history survives", async () => {
    const ctx = contextFor(await createTestUser("links"));
    const p = await project(ctx, "Fixture Payments");
    const ev = await evidence.create(
      ctx,
      parseInput(createEvidenceSchema, { type: "document", title: "Fixture load test" }),
    );
    const tech = await technologies.create(
      ctx,
      parseInput(createTechnologySchema, { name: "Fixture Kafka" }),
    );
    const d = await decision(ctx, {
      title: "Fixture: event bus",
      status: "accepted",
      context: "ctx",
    });
    const comp = await component(ctx, { name: "Fixture bus", type: "queue", critical: true });
    await decisions.replaceProjects(ctx, d.id, [p.id]);
    await decisions.replaceEvidence(ctx, d.id, [ev.id]);
    await decisions.replaceComponents(ctx, d.id, [comp.id]);
    await components.replaceTechnologies(ctx, comp.id, [tech.id]);
    await components.replaceProjects(ctx, comp.id, [p.id]);

    const dossier = await intel.getDecision(ctx, d.id);
    expect(dossier.projects.map((x) => x.name)).toEqual(["Fixture Payments"]);
    expect(dossier.evidence.map((x) => x.title)).toEqual(["Fixture load test"]);
    expect(dossier.components).toMatchObject([{ name: "Fixture bus", critical: true }]);

    await projects.delete(ctx, p.id);
    await technologies.delete(ctx, tech.id); // Phase 1 deletion still works
    const after = await intel.getDecision(ctx, d.id);
    expect(after.decision.title).toBe("Fixture: event bus");
    expect(after.projects).toEqual([]);
    expect((await intel.getComponent(ctx, comp.id)).technologies).toEqual([]);
  });

  it("alternatives are recorded, updated and deleted with an audit trail", async () => {
    const ctx = contextFor(await createTestUser("alts"));
    const d = await decision(ctx, { title: "Fixture: cache" });
    const alt = await decisions.addAlternative(
      ctx,
      d.id,
      parseInput(alternativeSchema, {
        name: "Memcached",
        cons: "No persistence",
        rejectedReason: "Need durability",
      }),
    );
    await decisions.updateAlternative(ctx, d.id, alt.id, { pros: "Simple" });
    expect((await intel.getDecision(ctx, d.id)).alternatives).toMatchObject([
      { name: "Memcached", pros: "Simple", rejectedReason: "Need durability" },
    ]);
    await decisions.deleteAlternative(ctx, d.id, alt.id);
    const actions = (
      await db.auditLog.findMany({
        where: { actorId: ctx.userId, entityType: "architecture_alternative" },
        orderBy: { createdAt: "asc" },
        select: { action: true },
      })
    ).map((r) => r.action);
    expect(actions).toEqual([
      "architecture_alternative.created",
      "architecture_alternative.updated",
      "architecture_alternative.deleted",
    ]);
  });

  it("dossier shows real dated history, supersession links, gaps and revisit state", async () => {
    const ctx = contextFor(await createTestUser("dossier"));
    const old = await decision(ctx, {
      title: "Fixture: REST",
      status: "accepted",
      revisitDate: day(-10),
    });
    const nu = await decision(ctx, { title: "Fixture: gRPC", status: "accepted" });
    await update(ctx, old.id, { status: "superseded", supersededById: nu.id });
    const d = await intel.getDecision(ctx, old.id);
    expect(d.supersededBy?.title).toBe("Fixture: gRPC");
    expect(d.history.map((h) => h.action)).toEqual(["created", "superseded"]);
    expect(d.history[1]!.from?.status).toBe("accepted");
    expect(d.history[1]!.to?.status).toBe("superseded");
    expect(d.revisitDue).toBe(false); // superseded decisions are not "due"
    expect((await intel.getDecision(ctx, nu.id)).supersedes.map((x) => x.title)).toEqual([
      "Fixture: REST",
    ]);
    expect(d.gaps).toEqual(
      expect.arrayContaining(["context", "alternatives", "projects", "evidence"]),
    );
  });
});

describe("components, dependencies and the bounded map", () => {
  it("dependencies are explicit, never self; the map draws only persisted edges within its bound", async () => {
    const ctx = contextFor(await createTestUser("map"));
    const api = await component(ctx, { name: "Fixture API", type: "service", critical: true });
    const dbc = await component(ctx, { name: "Fixture DB", type: "database" });
    const q = await component(ctx, { name: "Fixture Queue", type: "queue" });
    await components.replaceDependencies(ctx, api.id, [dbc.id, q.id]);
    await expect(components.replaceDependencies(ctx, dbc.id, [dbc.id])).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(component(ctx, { name: "fixture api", type: "service" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const node = await intel.getComponent(ctx, dbc.id);
    expect(node.dependents.map((x) => x.name)).toEqual(["Fixture API"]);

    const full = await intel.map(ctx, parseInput(mapQuerySchema, {}));
    expect(full.nodes[0]!.name).toBe("Fixture API"); // critical first
    expect(full.edges).toHaveLength(2);
    expect(full.truncated).toBe(false);
    for (let i = 0; i < 12; i++)
      await component(ctx, { name: `Fixture extra ${i}`, type: "infrastructure" });
    const bounded = await intel.map(ctx, parseInput(mapQuerySchema, { limit: "10" }));
    expect(bounded.nodes).toHaveLength(10);
    expect(bounded.truncated).toBe(true);
    expect(bounded.total).toBe(15);
    const included = new Set(bounded.nodes.map((n) => n.id));
    for (const e of bounded.edges) expect(included.has(e.from) && included.has(e.to)).toBe(true);
  });
});

describe("architecture analytics reconcile with the source lists", () => {
  async function seed(ctx: Ctx) {
    const p1 = await project(ctx, "Fixture P1");
    await project(ctx, "Fixture P2");
    const ev = await evidence.create(
      ctx,
      parseInput(createEvidenceSchema, { type: "document", title: "Fixture ADR doc" }),
    );
    const crit = await component(ctx, { name: "Fixture core", type: "service", critical: true });
    await component(ctx, { name: "Fixture db", type: "database" });
    const due = await decision(ctx, {
      title: "Fixture due",
      status: "accepted",
      revisitDate: day(-5),
      decidedAt: day(-200),
      context: "c",
      decision: "d",
      consequences: "q",
    });
    await decisions.replaceComponents(ctx, due.id, [crit.id]);
    await decisions.replaceProjects(ctx, due.id, [p1.id]);
    await decisions.replaceEvidence(ctx, due.id, [ev.id]);
    await decisions.addAlternative(ctx, due.id, parseInput(alternativeSchema, { name: "Other" }));
    const later = await decision(ctx, {
      title: "Fixture later",
      status: "accepted",
      revisitDate: day(-1),
    });
    const replaced = await decision(ctx, {
      title: "Fixture replaced",
      status: "accepted",
      decidedAt: day(-400),
    });
    await update(ctx, replaced.id, { status: "superseded", supersededById: later.id });
    await decision(ctx, { title: "Fixture idea" });
  }

  it("every metric and bucket equals its drill-down list total", async () => {
    const ctx = contextFor(await createTestUser("recon"));
    await seed(ctx);
    const s = await analytics.summary(ctx);
    const none = { from: null, to: null };
    const single: [
      string,
      number | null,
      (c: Ctx, q: Record<string, string>) => Promise<number>,
    ][] = [
      [s.decisions.key, s.decisions.value, decisionTotal],
      [s.inForce.key, s.inForce.value, decisionTotal],
      [s.revisitDue.key, s.revisitDue.value, decisionTotal],
      [s.staleCritical.key, s.staleCritical.value, decisionTotal],
      [s.withoutEvidence.key, s.withoutEvidence.value, decisionTotal],
      [s.withGaps.key, s.withGaps.value, decisionTotal],
      [s.components.key, s.components.value, componentTotal],
      [s.critical.key, s.critical.value, componentTotal],
      [s.componentsWithoutDecisions.key, s.componentsWithoutDecisions.value, componentTotal],
    ];
    for (const [key, value, total] of single) {
      expect(await total(ctx, query(metricHref(key, {}, none)!)), key).toBe(value);
    }
    expect(s.staleCritical.value).toBe(1);
    expect(s.revisitDue.value).toBe(2);
    // Project coverage numerator = the projects list filtered by hasArchitecture.
    expect(await projectTotal(ctx, query(metricHref(s.projectCoverage.key, {}, none)!))).toBe(
      s.projectCoverage.breakdown![0]!.value,
    );
    expect(await projectTotal(ctx, {})).toBe(
      s.projectCoverage.breakdown![0]!.value + s.projectCoverage.breakdown![1]!.value,
    );
    for (const bucket of s.status.breakdown ?? []) {
      expect(
        await decisionTotal(ctx, query(bucketHref(s.status.key, bucket.key, {})!)),
        bucket.key,
      ).toBe(bucket.value);
    }
    for (const bucket of s.timeline.breakdown ?? []) {
      expect(
        await decisionTotal(ctx, query(bucketHref(s.timeline.key, bucket.key, {})!)),
        bucket.key,
      ).toBe(bucket.value);
    }
    for (const bucket of s.componentTypes.breakdown ?? []) {
      expect(
        await componentTotal(ctx, query(bucketHref(s.componentTypes.key, bucket.key, {})!)),
        bucket.key,
      ).toBe(bucket.value);
    }
  });

  it("the Command Center shows the same KPI and stale critical decisions", async () => {
    const ctx = contextFor(await createTestUser("cc"));
    await seed(ctx);
    const s = await analytics.summary(ctx);
    const dash = await createDashboardService(db).dashboard(
      ctx,
      parseInput(dashboardFiltersSchema, {}),
    );
    expect(dash.kpis.find((k) => k.key === "architecture.decisions")?.value).toBe(
      s.decisions.value,
    );
    expect(dash.architecture.attention.staleCritical.map((d) => d.title)).toEqual(["Fixture due"]);
  });

  it("an empty account gets no-data states, not zeros", async () => {
    const ctx = contextFor(await createTestUser("empty"));
    const s = await analytics.summary(ctx);
    expect(s.decisions.state).toBe("no_data");
    expect(s.decisions.value).toBeNull();
    expect(s.projectCoverage.state).toBe("no_data");
    expect(s.components.state).toBe("no_data");
  });

  it("list filters, sort and pagination are server-side and deterministic", async () => {
    const ctx = contextFor(await createTestUser("list"));
    await seed(ctx);
    const first = await intel.listDecisions(
      ctx,
      parseInput(listDecisionsQuerySchema, { pageSize: "2" }),
    );
    expect(first.page.total).toBe(4);
    expect(first.data.map((d) => d.title)).toEqual(["Fixture later", "Fixture due"]);
    expect(await decisionTotal(ctx, { q: "replaced" })).toBe(1);
    expect(await decisionTotal(ctx, { status: "superseded" })).toBe(1); // history stays listed
  });
});
