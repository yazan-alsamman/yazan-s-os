import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { bucketHref, metricHref } from "@/components/command-center/drilldown";
import { getDb } from "@/lib/db/client";
import { parseInput } from "@/lib/validation/parse";
import { dashboardFiltersSchema } from "@/modules/analytics/dashboard.schemas";
import { createDashboardService } from "@/modules/analytics/dashboard.service";
import {
  createExperimentsAnalyticsService,
  type ExperimentsAnalyticsDto,
} from "@/modules/analytics/experiments-analytics.service";
import { createEvidenceSchema } from "@/modules/evidence/evidence.schemas";
import { createEvidenceService } from "@/modules/evidence/evidence.service";
import { createExperimentIntelligenceService } from "@/modules/experiments/experiment-intelligence";
import {
  createExperimentSchema,
  createMetricSchema,
  createRunSchema,
  listExperimentsQuerySchema,
  updateExperimentSchema,
} from "@/modules/experiments/experiment.schemas";
import { createExperimentService } from "@/modules/experiments/experiment.service";
import { createProjectSchema } from "@/modules/projects/project.schemas";
import { createProjectService } from "@/modules/projects/project.service";

import { contextFor, createTestUser, truncateAll } from "./database";

const db = getDb();
const svc = createExperimentService(db);
const intel = createExperimentIntelligenceService(db);
const analytics = createExperimentsAnalyticsService(db);
type Ctx = ReturnType<typeof contextFor>;

const exp = (ctx: Ctx, input: Record<string, unknown>) =>
  svc.create(ctx, parseInput(createExperimentSchema, input));
const run = (ctx: Ctx, id: string, input: Record<string, unknown> = {}) =>
  svc.createRun(ctx, id, parseInput(createRunSchema, input));
const metric = (ctx: Ctx, id: string, runId: string, input: Record<string, unknown>) =>
  svc.addMetric(ctx, id, runId, parseInput(createMetricSchema, input));
const listTotal = async (ctx: Ctx, q: Record<string, string>) =>
  (await intel.list(ctx, parseInput(listExperimentsQuerySchema, q))).page.total;
const query = (href: string) =>
  Object.fromEntries(new URL(href, "http://x").searchParams.entries());

beforeEach(() => truncateAll());
afterAll(() => db.$disconnect());

describe("experiment lifecycle, runs and audit", () => {
  it("create → activate → run → metric → complete → reopen → delete, audited in order", async () => {
    const ctx = contextFor(await createTestUser("life"));
    const e = await exp(ctx, { title: "Fixture: prompt eval", status: "planned" });
    await svc.update(ctx, e.id, parseInput(updateExperimentSchema, { status: "active" }));
    const r = await run(ctx, e.id, { model: "gpt", costUsd: 0.5, latencyMs: 300 });
    expect(r.runNumber).toBe(1);
    await metric(ctx, e.id, r.id, {
      name: "accuracy",
      value: 0.9,
      unit: "ratio",
      higherIsBetter: true,
    });
    await svc.update(
      ctx,
      e.id,
      parseInput(updateExperimentSchema, { status: "completed", decision: "adopt" }),
    );
    const completed = await svc.get(ctx, e.id);
    expect(completed.status).toBe("completed");
    expect(completed.completedAt).not.toBeNull();
    expect(completed.decision).toBe("adopt");
    await svc.update(ctx, e.id, parseInput(updateExperimentSchema, { status: "active" }));
    expect((await svc.get(ctx, e.id)).completedAt).toBeNull(); // reopen clears completion
    await svc.delete(ctx, e.id);
    await expect(svc.get(ctx, e.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    const actions = (
      await db.auditLog.findMany({
        where: { actorId: ctx.userId },
        orderBy: { createdAt: "asc" },
        select: { action: true },
      })
    ).map((a) => a.action);
    expect(actions).toEqual([
      "ai_experiment.created",
      "ai_experiment.updated",
      "experiment_run.created",
      "experiment_metric.created",
      "ai_experiment.completed",
      "ai_experiment.reopened",
      "ai_experiment.deleted",
    ]);
  });

  it("rejects illegal transitions and future completion; completion is not success", async () => {
    const ctx = contextFor(await createTestUser("trans"));
    const e = await exp(ctx, { title: "Fixture", status: "planned" });
    // planned → completed is not allowed.
    await expect(
      svc.update(ctx, e.id, parseInput(updateExperimentSchema, { status: "completed" })),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await svc.update(ctx, e.id, parseInput(updateExperimentSchema, { status: "active" }));
    await expect(
      svc.update(
        ctx,
        e.id,
        parseInput(updateExperimentSchema, { status: "completed", completedAt: "2099-01-01" }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    // A completed experiment with no decision is not "successful".
    await svc.update(ctx, e.id, parseInput(updateExperimentSchema, { status: "completed" }));
    expect((await svc.get(ctx, e.id)).decision).toBeNull();
  });

  it("runs are append-only and numbered; deleting one keeps the rest; DB check rejects negative cost", async () => {
    const ctx = contextFor(await createTestUser("runs"));
    const e = await exp(ctx, { title: "Fixture" });
    const r1 = await run(ctx, e.id, { label: "first" });
    const r2 = await run(ctx, e.id, { label: "second" });
    const r3 = await run(ctx, e.id, { label: "third" });
    expect([r1.runNumber, r2.runNumber, r3.runNumber]).toEqual([1, 2, 3]);
    await svc.deleteRun(ctx, e.id, r2.id);
    const remaining = await db.experimentRun.findMany({
      where: { experimentId: e.id },
      orderBy: { runNumber: "asc" },
    });
    expect(remaining.map((r) => r.runNumber)).toEqual([1, 3]); // history preserved, not renumbered
    await expect(
      db.experimentRun.create({
        data: { userId: ctx.userId, experimentId: e.id, runNumber: 9, costUsd: -1 },
      }),
    ).rejects.toThrow(/experiment_runs_cost_chk/);
  });
});

describe("reproducibility and dossier derive from recorded runs", () => {
  it("classifies reproducibility by recorded metadata and reuses it in the dossier", async () => {
    const ctx = contextFor(await createTestUser("repro"));
    const full = await exp(ctx, { title: "Fully specified" });
    await run(ctx, full.id, {
      model: "gpt",
      modelVersion: "1",
      promptVersion: "p1",
      datasetName: "set",
      codeRef: "abc123",
    });
    const partial = await exp(ctx, { title: "Partially specified" });
    await run(ctx, partial.id, { model: "gpt" });
    const empty = await exp(ctx, { title: "No runs" });

    expect((await intel.get(ctx, full.id)).reproducibility.state).toBe("reproducible");
    expect((await intel.get(ctx, partial.id)).reproducibility.state).toBe("partial");
    const none = await intel.get(ctx, empty.id);
    expect(none.reproducibility.state).toBe("unknown");
    expect(none.signals.runs.total).toBe(0);
    expect(none.reproducibility.explanation).toMatch(
      /not a verified reproduction|cannot be assessed/i,
    );
  });

  it("measurements and evaluation are recorded facts; missing values stay null, not zero", async () => {
    const ctx = contextFor(await createTestUser("facts"));
    const e = await exp(ctx, { title: "Fixture" });
    const r = await run(ctx, e.id, { model: "m" }); // no cost/latency/tokens recorded
    const dossier = await intel.get(ctx, e.id);
    expect(dossier.runs[0]!.costUsd).toBeNull();
    expect(dossier.runs[0]!.latencyMs).toBeNull();
    expect(dossier.signals.measured.cost).toBe(0);
    expect(dossier.runs[0]!.metrics).toEqual([]);
    await metric(ctx, e.id, r.id, { name: "f1", value: 0.42 });
    expect((await intel.get(ctx, e.id)).runs[0]!.metrics[0]).toMatchObject({
      name: "f1",
      value: 0.42,
    });
  });

  it("compares two runs with deltas and never declares a winner", async () => {
    const ctx = contextFor(await createTestUser("cmp"));
    const e = await exp(ctx, { title: "Fixture" });
    const r1 = await run(ctx, e.id, { model: "a", costUsd: 10 });
    const r2 = await run(ctx, e.id, { model: "b", costUsd: 7 });
    await metric(ctx, e.id, r1.id, { name: "accuracy", value: 0.8, higherIsBetter: true });
    await metric(ctx, e.id, r2.id, { name: "accuracy", value: 0.85, higherIsBetter: true });
    const cmp = await intel.compare(ctx, e.id, { a: r1.id, b: r2.id });
    expect(cmp.diff.config.find((c) => c.key === "model")?.changed).toBe(true);
    expect(cmp.diff.measures.find((m) => m.key === "cost")).toMatchObject({
      verdict: "improvement",
    });
    expect(cmp.diff.metrics.find((m) => m.name === "accuracy")).toMatchObject({
      verdict: "improvement",
    });
  });
});

describe("AI Lab analytics reconcile with the experiments list", () => {
  async function seed(ctx: Ctx) {
    const projects = createProjectService(db);
    const project = await projects.create(
      ctx,
      parseInput(createProjectSchema, { name: "Fixture Project" }),
    );
    const evidence = createEvidenceService(db);
    const ev = await evidence.create(
      ctx,
      parseInput(createEvidenceSchema, { type: "document", title: "Fixture evidence" }),
    );

    const adopted = await exp(ctx, {
      title: "Adopted",
      status: "active",
      category: "RAG",
      projectId: project.id,
    });
    await svc.update(
      ctx,
      adopted.id,
      parseInput(updateExperimentSchema, { status: "completed", decision: "adopt" }),
    );
    const rr = await run(ctx, adopted.id, {
      model: "gpt",
      modelVersion: "1",
      promptVersion: "p",
      datasetName: "d",
      codeRef: "c",
    });
    await metric(ctx, adopted.id, rr.id, { name: "accuracy", value: 0.9, higherIsBetter: true });
    await svc.replaceEvidence(ctx, adopted.id, [ev.id]);

    const rejected = await exp(ctx, { title: "Rejected", status: "active", category: "RAG" });
    await svc.update(
      ctx,
      rejected.id,
      parseInput(updateExperimentSchema, { status: "completed", decision: "reject" }),
    );
    await run(ctx, rejected.id, { model: "gpt" }); // partial repro, no evaluation

    await exp(ctx, { title: "Planned idea" }); // planned, no runs
    await exp(ctx, { title: "Abandoned", status: "active" }).then((e) =>
      svc.update(ctx, e.id, parseInput(updateExperimentSchema, { status: "abandoned" })),
    );
  }

  it("every metric and bucket equals its drill-down list total", async () => {
    const ctx = contextFor(await createTestUser("recon"));
    await seed(ctx);
    const s = await analytics.summary(ctx);
    const period = { from: null, to: null };

    const checkSingle = async (
      metricResult: ExperimentsAnalyticsDto[keyof ExperimentsAnalyticsDto],
    ) => {
      const mr = metricResult as { key: string; value: number | null };
      const href = metricHref(mr.key, {}, period);
      if (!href || mr.value === null) return;
      expect(await listTotal(ctx, query(href) as Record<string, string>), mr.key).toBe(mr.value);
    };
    for (const k of ["total", "active", "completed", "abandoned"] as const) {
      await checkSingle(s[k]);
    }
    expect(
      await listTotal(
        ctx,
        query(metricHref("ai.experiments_missing_evaluation", {}, period)!) as Record<
          string,
          string
        >,
      ),
    ).toBe(s.missingEvaluation.value);
    expect(
      await listTotal(
        ctx,
        query(metricHref("ai.experiments_missing_provenance", {}, period)!) as Record<
          string,
          string
        >,
      ),
    ).toBe(s.missingProvenance.value);
    // adoption numerator and evaluation-coverage numerator
    expect(
      await listTotal(
        ctx,
        query(metricHref("ai.adoption_rate", {}, period)!) as Record<string, string>,
      ),
    ).toBe(s.adoptionRate.breakdown![0]!.value);
    expect(
      await listTotal(
        ctx,
        query(metricHref("ai.evaluation_coverage", {}, period)!) as Record<string, string>,
      ),
    ).toBe(s.evaluationCoverage.breakdown![0]!.value);

    for (const dist of [s.status, s.reproducibility] as const) {
      for (const bucket of dist.breakdown ?? []) {
        const href = bucketHref(dist.key, bucket.key, {});
        if (!href) continue;
        expect(
          await listTotal(ctx, query(href) as Record<string, string>),
          `${dist.key}:${bucket.key}`,
        ).toBe(bucket.value);
      }
    }
    // Decision buckets except the undecided (NULL) bucket, which has no list filter.
    for (const bucket of s.decision.breakdown ?? []) {
      const href = bucketHref(s.decision.key, bucket.key, {});
      if (!href) continue;
      expect(await listTotal(ctx, query(href) as Record<string, string>), bucket.key).toBe(
        bucket.value,
      );
    }
  });

  it("the Command Center shows the same active-experiments value", async () => {
    const ctx = contextFor(await createTestUser("cc"));
    await seed(ctx);
    const s = await analytics.summary(ctx);
    const dash = await createDashboardService(db).dashboard(
      ctx,
      parseInput(dashboardFiltersSchema, {}),
    );
    expect(dash.experiments.active.value).toBe(s.active.value);
    expect(dash.kpis.some((k) => k.key === "ai.active_experiments")).toBe(true);
  });

  it("an empty account gets no-data states, not zeros", async () => {
    const ctx = contextFor(await createTestUser("empty"));
    const s = await analytics.summary(ctx);
    expect(s.total.state).toBe("no_data");
    expect(s.total.value).toBeNull();
    expect(s.adoptionRate.state).toBe("no_data");
    expect(s.measurements.cost.avgUsd).toBeNull();
  });

  it("list filters, sort and pagination are server-side and deterministic", async () => {
    const ctx = contextFor(await createTestUser("list"));
    await seed(ctx);
    expect(await listTotal(ctx, { status: "completed" })).toBe(2);
    expect(await listTotal(ctx, { open: "true" })).toBe(1); // only the planned one is open
    expect(await listTotal(ctx, { hasRuns: "true" })).toBe(2);
    expect(await listTotal(ctx, { hasEvaluation: "true" })).toBe(1);
    expect(await listTotal(ctx, { reproducibility: "reproducible" })).toBe(1);
    const page = await intel.list(
      ctx,
      parseInput(listExperimentsQuerySchema, { pageSize: "2", sort: "title" }),
    );
    expect(page.data.length).toBe(2);
    expect(page.page.total).toBe(4);
  });
});
