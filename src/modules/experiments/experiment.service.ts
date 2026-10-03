import type { AIExperiment, ExperimentRun, PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors/app-error";
import { auditInTx, type Tx } from "@/modules/shared/audit";
import { assertAllOwned, assertDateOrder, requireFound } from "@/modules/shared/ownership-checks";
import type { ServiceContext } from "@/modules/shared/service-context";

import {
  assertTransition,
  experimentTransitionVerb,
  MAX_EXPERIMENTS_PER_USER,
  MAX_METRICS_PER_RUN,
  MAX_RUNS_PER_EXPERIMENT,
  resolveCompletion,
} from "./experiment.rules";
import type {
  CreateExperimentInput,
  CreateMetricInput,
  CreateRunInput,
  UpdateExperimentInput,
  UpdateRunInput,
} from "./experiment.schemas";

/**
 * AI Lab (Phase 6, ADRs 0036–0040). Owner-scoped CRUD for experiments, runs and recorded
 * evaluation metrics, plus evidence links. Runs are append-only history; measurements are
 * user-recorded facts — the service never derives cost, latency, tokens or scores. Every mutation
 * is audited in its transaction, and the composite FKs make cross-owner links impossible.
 */

export function experimentSnapshot(e: AIExperiment) {
  return {
    id: e.id,
    projectId: e.projectId,
    title: e.title,
    hypothesis: e.hypothesis,
    objective: e.objective,
    category: e.category,
    status: e.status,
    decision: e.decision,
    result: e.result,
    reproducibilityNote: e.reproducibilityNote,
    startedAt: e.startedAt ? e.startedAt.toISOString().slice(0, 10) : null,
    completedAt: e.completedAt ? e.completedAt.toISOString().slice(0, 10) : null,
  };
}

export function toExperimentDto(e: AIExperiment) {
  return {
    ...experimentSnapshot(e),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}
export type ExperimentDto = ReturnType<typeof toExperimentDto>;

export function runSnapshot(r: ExperimentRun) {
  return {
    id: r.id,
    experimentId: r.experimentId,
    runNumber: r.runNumber,
    label: r.label,
    status: r.status,
    model: r.model,
    modelVersion: r.modelVersion,
    provider: r.provider,
    promptVersion: r.promptVersion,
    datasetName: r.datasetName,
    datasetVersion: r.datasetVersion,
    codeRef: r.codeRef,
    environment: r.environment,
    runAt: r.runAt ? r.runAt.toISOString().slice(0, 10) : null,
    costUsd: r.costUsd,
    latencyMs: r.latencyMs,
    tokensInput: r.tokensInput,
    tokensOutput: r.tokensOutput,
    notes: r.notes,
  };
}

async function findExperiment(tx: Tx | PrismaClient, userId: string, id: string) {
  return requireFound(await tx.aIExperiment.findFirst({ where: { id, userId } }));
}

async function findRun(tx: Tx | PrismaClient, userId: string, experimentId: string, runId: string) {
  return requireFound(
    await tx.experimentRun.findFirst({ where: { id: runId, experimentId, userId } }),
  );
}

/** The project (if any) must belong to the caller; a missing or foreign id is reported the same. */
async function assertProjectOwned(tx: Tx, userId: string, projectId: string | null | undefined) {
  if (!projectId) return;
  const owned = await tx.project.count({ where: { id: projectId, userId } });
  if (owned !== 1) {
    throw new AppError("VALIDATION_FAILED", {
      message: "The linked project does not exist.",
      details: [{ path: "projectId", message: "The linked project does not exist." }],
    });
  }
}

export function createExperimentService(db: PrismaClient, clock: () => Date = () => new Date()) {
  return {
    async get(ctx: ServiceContext, id: string) {
      return toExperimentDto(await findExperiment(db, ctx.userId, id));
    },

    create(ctx: ServiceContext, input: CreateExperimentInput) {
      const now = clock();
      return db.$transaction(async (tx) => {
        if (
          (await tx.aIExperiment.count({ where: { userId: ctx.userId } })) >=
          MAX_EXPERIMENTS_PER_USER
        ) {
          throw new AppError("VALIDATION_FAILED", {
            message: `You can have at most ${MAX_EXPERIMENTS_PER_USER} experiments.`,
          });
        }
        await assertProjectOwned(tx, ctx.userId, input.projectId);
        assertDateOrder(input.startedAt, input.completedAt, "completedAt");
        const completion = resolveCompletion(
          { status: input.status ?? "planned", completedAt: input.completedAt },
          now,
        );
        const created = await tx.aIExperiment.create({
          data: {
            userId: ctx.userId,
            projectId: input.projectId ?? null,
            title: input.title,
            hypothesis: input.hypothesis ?? null,
            objective: input.objective ?? null,
            category: input.category ?? null,
            status: completion.status,
            decision: input.decision ?? null,
            result: input.result ?? null,
            reproducibilityNote: input.reproducibilityNote ?? null,
            startedAt: input.startedAt ?? null,
            completedAt: completion.completedAt,
          },
        });
        await auditInTx(tx, ctx, {
          entity: "ai_experiment",
          verb: "created",
          entityId: created.id,
          after: experimentSnapshot(created),
        });
        return toExperimentDto(created);
      });
    },

    update(ctx: ServiceContext, id: string, input: UpdateExperimentInput) {
      const now = clock();
      return db.$transaction(async (tx) => {
        const before = await findExperiment(tx, ctx.userId, id);
        if (input.projectId !== undefined)
          await assertProjectOwned(tx, ctx.userId, input.projectId);
        const nextStatus = input.status ?? before.status;
        if (input.status) assertTransition(before.status, input.status);
        const startedAt = input.startedAt !== undefined ? input.startedAt : before.startedAt;
        const completedAtInput =
          input.completedAt !== undefined ? input.completedAt : before.completedAt;
        assertDateOrder(startedAt, completedAtInput, "completedAt");
        const completion = resolveCompletion(
          {
            status: nextStatus,
            // Reopening (leaving completed) clears the date unless a new one is supplied.
            completedAt:
              nextStatus === "completed"
                ? completedAtInput
                : input.completedAt !== undefined
                  ? input.completedAt
                  : null,
          },
          now,
        );
        const updated = await tx.aIExperiment.update({
          where: { id },
          data: {
            projectId: input.projectId !== undefined ? input.projectId : undefined,
            title: input.title,
            hypothesis: input.hypothesis,
            objective: input.objective,
            category: input.category,
            status: completion.status,
            decision: input.decision !== undefined ? input.decision : undefined,
            result: input.result,
            reproducibilityNote: input.reproducibilityNote,
            startedAt: input.startedAt !== undefined ? input.startedAt : undefined,
            completedAt: completion.completedAt,
          },
        });
        await auditInTx(tx, ctx, {
          entity: "ai_experiment",
          verb: experimentTransitionVerb(before.status, updated.status),
          entityId: id,
          before: experimentSnapshot(before),
          after: experimentSnapshot(updated),
        });
        return toExperimentDto(updated);
      });
    },

    delete(ctx: ServiceContext, id: string) {
      return db.$transaction(async (tx) => {
        const before = await findExperiment(tx, ctx.userId, id);
        await tx.aIExperiment.delete({ where: { id } });
        await auditInTx(tx, ctx, {
          entity: "ai_experiment",
          verb: "deleted",
          entityId: id,
          before: experimentSnapshot(before),
        });
      });
    },

    // ── Runs (append-only history) ────────────────────────────────────────────

    createRun(ctx: ServiceContext, experimentId: string, input: CreateRunInput) {
      return db.$transaction(async (tx) => {
        await findExperiment(tx, ctx.userId, experimentId);
        const count = await tx.experimentRun.count({ where: { userId: ctx.userId, experimentId } });
        if (count >= MAX_RUNS_PER_EXPERIMENT) {
          throw new AppError("VALIDATION_FAILED", {
            message: `An experiment can have at most ${MAX_RUNS_PER_EXPERIMENT} runs.`,
          });
        }
        const max = await tx.experimentRun.aggregate({
          where: { userId: ctx.userId, experimentId },
          _max: { runNumber: true },
        });
        const runNumber = (max._max.runNumber ?? 0) + 1;
        const created = await tx.experimentRun.create({
          data: {
            userId: ctx.userId,
            experimentId,
            runNumber,
            label: input.label ?? null,
            status: input.status ?? "completed",
            model: input.model ?? null,
            modelVersion: input.modelVersion ?? null,
            provider: input.provider ?? null,
            promptVersion: input.promptVersion ?? null,
            datasetName: input.datasetName ?? null,
            datasetVersion: input.datasetVersion ?? null,
            codeRef: input.codeRef ?? null,
            environment: input.environment ?? null,
            runAt: input.runAt ?? null,
            costUsd: input.costUsd ?? null,
            latencyMs: input.latencyMs ?? null,
            tokensInput: input.tokensInput ?? null,
            tokensOutput: input.tokensOutput ?? null,
            notes: input.notes ?? null,
          },
        });
        await auditInTx(tx, ctx, {
          entity: "experiment_run",
          verb: "created",
          entityId: created.id,
          after: runSnapshot(created),
        });
        return runSnapshot(created);
      });
    },

    updateRun(ctx: ServiceContext, experimentId: string, runId: string, input: UpdateRunInput) {
      return db.$transaction(async (tx) => {
        const before = await findRun(tx, ctx.userId, experimentId, runId);
        const updated = await tx.experimentRun.update({
          where: { id: runId },
          data: {
            label: input.label,
            status: input.status,
            model: input.model,
            modelVersion: input.modelVersion,
            provider: input.provider,
            promptVersion: input.promptVersion,
            datasetName: input.datasetName,
            datasetVersion: input.datasetVersion,
            codeRef: input.codeRef,
            environment: input.environment,
            runAt: input.runAt !== undefined ? input.runAt : undefined,
            costUsd: input.costUsd !== undefined ? input.costUsd : undefined,
            latencyMs: input.latencyMs !== undefined ? input.latencyMs : undefined,
            tokensInput: input.tokensInput !== undefined ? input.tokensInput : undefined,
            tokensOutput: input.tokensOutput !== undefined ? input.tokensOutput : undefined,
            notes: input.notes,
          },
        });
        await auditInTx(tx, ctx, {
          entity: "experiment_run",
          verb: "updated",
          entityId: runId,
          before: runSnapshot(before),
          after: runSnapshot(updated),
        });
        return runSnapshot(updated);
      });
    },

    deleteRun(ctx: ServiceContext, experimentId: string, runId: string) {
      return db.$transaction(async (tx) => {
        const before = await findRun(tx, ctx.userId, experimentId, runId);
        await tx.experimentRun.delete({ where: { id: runId } });
        await auditInTx(tx, ctx, {
          entity: "experiment_run",
          verb: "deleted",
          entityId: runId,
          before: runSnapshot(before),
        });
      });
    },

    // ── Recorded evaluation metrics ────────────────────────────────────────────

    addMetric(ctx: ServiceContext, experimentId: string, runId: string, input: CreateMetricInput) {
      return db.$transaction(async (tx) => {
        await findRun(tx, ctx.userId, experimentId, runId);
        const count = await tx.experimentMetric.count({ where: { userId: ctx.userId, runId } });
        if (count >= MAX_METRICS_PER_RUN) {
          throw new AppError("VALIDATION_FAILED", {
            message: `A run can have at most ${MAX_METRICS_PER_RUN} evaluation metrics.`,
          });
        }
        const created = await tx.experimentMetric.create({
          data: {
            userId: ctx.userId,
            runId,
            name: input.name,
            value: input.value,
            unit: input.unit ?? null,
            higherIsBetter: input.higherIsBetter ?? null,
            note: input.note ?? null,
          },
        });
        await auditInTx(tx, ctx, {
          entity: "experiment_metric",
          verb: "created",
          entityId: created.id,
          after: { runId, name: created.name, value: created.value, unit: created.unit },
        });
        return {
          id: created.id,
          name: created.name,
          value: created.value,
          unit: created.unit,
          higherIsBetter: created.higherIsBetter,
          note: created.note,
        };
      });
    },

    deleteMetric(ctx: ServiceContext, experimentId: string, runId: string, metricId: string) {
      return db.$transaction(async (tx) => {
        await findRun(tx, ctx.userId, experimentId, runId);
        const metric = requireFound(
          await tx.experimentMetric.findFirst({
            where: { id: metricId, userId: ctx.userId, runId },
          }),
        );
        await tx.experimentMetric.delete({ where: { id: metricId } });
        await auditInTx(tx, ctx, {
          entity: "experiment_metric",
          verb: "deleted",
          entityId: metricId,
          before: { runId, name: metric.name, value: metric.value, unit: metric.unit },
        });
      });
    },

    // ── Evidence links (reuse the Evidence domain) ─────────────────────────────

    replaceEvidence(ctx: ServiceContext, experimentId: string, evidenceIds: string[]) {
      return db.$transaction(async (tx) => {
        await findExperiment(tx, ctx.userId, experimentId);
        const userId = ctx.userId;
        assertAllOwned(
          await tx.evidence.count({ where: { userId, id: { in: evidenceIds } } }),
          evidenceIds,
          "evidenceIds",
        );
        const before = (
          await tx.experimentEvidence.findMany({
            where: { userId, experimentId },
            select: { evidenceId: true },
          })
        ).map((r) => r.evidenceId);
        await tx.experimentEvidence.deleteMany({ where: { userId, experimentId } });
        if (evidenceIds.length)
          await tx.experimentEvidence.createMany({
            data: evidenceIds.map((evidenceId) => ({ userId, experimentId, evidenceId })),
          });
        await auditInTx(tx, ctx, {
          entity: "ai_experiment",
          verb: "relations_updated",
          entityId: experimentId,
          before: { evidenceIds: [...before].sort() },
          after: { evidenceIds: [...evidenceIds].sort() },
        });
        return toExperimentDto(await findExperiment(tx, ctx.userId, experimentId));
      });
    },
  };
}

export type ExperimentService = ReturnType<typeof createExperimentService>;
