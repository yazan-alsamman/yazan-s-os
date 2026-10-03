import type { Goal, GoalMeasurement, PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors/app-error";
import { auditInTx, type Tx } from "@/modules/shared/audit";
import { utcDay } from "@/modules/shared/calendar";
import { toDateOnly } from "@/modules/shared/fields";
import { assertAllOwned, assertDateOrder, requireFound } from "@/modules/shared/ownership-checks";
import type { ServiceContext } from "@/modules/shared/service-context";

import {
  assertChildrenFit,
  assertTransition,
  assertValidParent,
  createsDependencyCycle,
  goalTransitionVerb,
  MAX_GOALS_PER_USER,
  resolveGoalCompletion,
} from "./goal.rules";
import type { CreateGoalInput, UpdateGoalInput } from "./goal.schemas";

/**
 * Goals (Phase 5, ADRs 0031–0032). Owner-scoped CRUD with lifecycle and hierarchy rules,
 * replace-set relationships and measurements. Every mutation is audited in its transaction.
 * The composite FKs (…, user_id) make cross-owner links impossible in the database as well.
 */
export const MAX_MEASUREMENTS_PER_GOAL = 1_000;

export function goalSnapshot(g: Goal) {
  return {
    id: g.id,
    parentId: g.parentId,
    title: g.title,
    type: g.type,
    description: g.description,
    outcome: g.outcome,
    metric: g.metric,
    unit: g.unit,
    baseline: g.baseline,
    target: g.target,
    startDate: toDateOnly(g.startDate),
    deadline: toDateOnly(g.deadline),
    status: g.status,
    completedAt: toDateOnly(g.completedAt),
    confidence: g.confidence,
  };
}

export function toGoalDto(g: Goal) {
  return {
    ...goalSnapshot(g),
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}

export type GoalDto = ReturnType<typeof toGoalDto>;

const measurementDto = (m: GoalMeasurement) => ({
  id: m.id,
  date: toDateOnly(m.date)!,
  value: m.value,
  note: m.note,
});

async function findOwned(tx: Tx | PrismaClient, userId: string, id: string) {
  return requireFound(await tx.goal.findFirst({ where: { id, userId } }));
}

/** The parent must be the caller's (missing and foreign parents are reported the same way). */
async function loadParent(tx: Tx, userId: string, parentId: string | null | undefined) {
  if (!parentId) return null;
  const parent = await tx.goal.findFirst({
    where: { id: parentId, userId },
    select: { id: true, type: true },
  });
  if (!parent) {
    throw new AppError("VALIDATION_FAILED", {
      details: [{ path: "parentId", message: "The parent goal does not exist." }],
    });
  }
  return parent;
}

export function createGoalService(db: PrismaClient, clock: () => Date = () => new Date()) {
  async function replaceLinks(
    ctx: ServiceContext,
    goalId: string,
    kind: "projects" | "skills" | "dependencies" | "milestones",
    ids: string[],
  ) {
    return db.$transaction(async (tx) => {
      await findOwned(tx, ctx.userId, goalId);
      const userId = ctx.userId;
      let before: string[] = [];
      if (kind === "projects") {
        assertAllOwned(
          await tx.project.count({ where: { userId, id: { in: ids } } }),
          ids,
          "projectIds",
        );
        before = (
          await tx.goalProject.findMany({ where: { userId, goalId }, select: { projectId: true } })
        ).map((r) => r.projectId);
        await tx.goalProject.deleteMany({ where: { userId, goalId } });
        if (ids.length)
          await tx.goalProject.createMany({
            data: ids.map((projectId) => ({ userId, goalId, projectId })),
          });
      } else if (kind === "skills") {
        assertAllOwned(
          await tx.skill.count({ where: { userId, id: { in: ids } } }),
          ids,
          "skillIds",
        );
        before = (
          await tx.goalSkill.findMany({ where: { userId, goalId }, select: { skillId: true } })
        ).map((r) => r.skillId);
        await tx.goalSkill.deleteMany({ where: { userId, goalId } });
        if (ids.length)
          await tx.goalSkill.createMany({
            data: ids.map((skillId) => ({ userId, goalId, skillId })),
          });
      } else if (kind === "dependencies") {
        assertAllOwned(await tx.goal.count({ where: { userId, id: { in: ids } } }), ids, "goalIds");
        const edges = await tx.goalDependency.findMany({
          where: { userId, goalId: { not: goalId } },
          select: { goalId: true, dependsOnGoalId: true },
        });
        for (const to of ids) {
          if (createsDependencyCycle(edges, goalId, to)) {
            throw new AppError("VALIDATION_FAILED", {
              details: [
                {
                  path: "goalIds",
                  message:
                    "Dependencies cannot form a cycle (a goal cannot depend on itself, directly or indirectly).",
                },
              ],
            });
          }
        }
        before = (
          await tx.goalDependency.findMany({
            where: { userId, goalId },
            select: { dependsOnGoalId: true },
          })
        ).map((r) => r.dependsOnGoalId);
        await tx.goalDependency.deleteMany({ where: { userId, goalId } });
        if (ids.length)
          await tx.goalDependency.createMany({
            data: ids.map((dependsOnGoalId) => ({ userId, goalId, dependsOnGoalId })),
          });
      } else {
        const owned = await tx.milestone.findMany({
          where: { userId, id: { in: ids } },
          select: { id: true, goalId: true },
        });
        assertAllOwned(owned.length, ids, "milestoneIds");
        // 04: Goal 1:N Milestone — a milestone counts toward one goal only (never double-counted).
        if (owned.some((m) => m.goalId && m.goalId !== goalId)) {
          throw new AppError("CONFLICT", {
            message:
              "One or more milestones already count toward another goal. Unlink them there first.",
            details: [{ path: "milestoneIds", message: "Already linked to another goal" }],
          });
        }
        before = (
          await tx.milestone.findMany({ where: { userId, goalId }, select: { id: true } })
        ).map((r) => r.id);
        await tx.milestone.updateMany({
          where: { userId, goalId, id: { notIn: ids } },
          data: { goalId: null },
        });
        if (ids.length)
          await tx.milestone.updateMany({ where: { userId, id: { in: ids } }, data: { goalId } });
      }
      const key =
        kind === "dependencies"
          ? "dependsOnGoalIds"
          : kind === "milestones"
            ? "milestoneIds"
            : kind === "projects"
              ? "projectIds"
              : "skillIds";
      await auditInTx(tx, ctx, {
        entity: "goal",
        verb: "relations_updated",
        entityId: goalId,
        before: { [key]: [...before].sort() },
        after: { [key]: [...ids].sort() },
      });
      return toGoalDto(await findOwned(tx, ctx.userId, goalId));
    });
  }

  return {
    async get(ctx: ServiceContext, id: string) {
      return toGoalDto(await findOwned(db, ctx.userId, id));
    },

    create(ctx: ServiceContext, input: CreateGoalInput) {
      const now = clock();
      return db.$transaction(async (tx) => {
        if ((await tx.goal.count({ where: { userId: ctx.userId } })) >= MAX_GOALS_PER_USER) {
          throw new AppError("VALIDATION_FAILED", {
            message: `You can have at most ${MAX_GOALS_PER_USER} goals.`,
          });
        }
        const parent = await loadParent(tx, ctx.userId, input.parentId);
        assertValidParent({ type: input.type }, parent);
        assertDateOrder(input.startDate, input.deadline, "deadline");
        const completion = resolveGoalCompletion(
          { status: input.status ?? "draft", completedAt: input.completedAt },
          now,
        );
        const goal = await tx.goal.create({
          data: {
            userId: ctx.userId,
            parentId: parent?.id ?? null,
            title: input.title,
            type: input.type,
            description: input.description ?? null,
            outcome: input.outcome ?? null,
            metric: input.metric ?? null,
            unit: input.unit ?? null,
            baseline: input.baseline ?? null,
            target: input.target ?? null,
            startDate: input.startDate ?? null,
            deadline: input.deadline ?? null,
            confidence: input.confidence ?? null,
            ...completion,
          },
        });
        await auditInTx(tx, ctx, {
          entity: "goal",
          verb: "created",
          entityId: goal.id,
          after: goalSnapshot(goal),
        });
        return toGoalDto(goal);
      });
    },

    update(ctx: ServiceContext, id: string, input: UpdateGoalInput) {
      const now = clock();
      return db.$transaction(async (tx) => {
        const existing = await findOwned(tx, ctx.userId, id);
        const type = input.type ?? existing.type;
        const parentId = input.parentId !== undefined ? input.parentId : existing.parentId;
        const parent = await loadParent(tx, ctx.userId, parentId);
        const children = await tx.goal.findMany({
          where: { userId: ctx.userId, parentId: id },
          select: { type: true },
        });
        assertValidParent({ id, type }, parent);
        assertChildrenFit(
          type,
          children.map((c) => c.type),
        );
        const startDate = input.startDate !== undefined ? input.startDate : existing.startDate;
        const deadline = input.deadline !== undefined ? input.deadline : existing.deadline;
        assertDateOrder(startDate, deadline, "deadline");
        const status = input.status ?? existing.status;
        assertTransition(existing.status, status);
        const completedAt =
          input.completedAt !== undefined
            ? input.completedAt
            : status === "completed" && existing.status === "completed"
              ? existing.completedAt
              : null;
        const completion = resolveGoalCompletion({ status, completedAt }, now);
        const { completedAt: _c, status: _s, parentId: _p, ...fields } = input;
        const updated = await tx.goal.update({
          where: { id: existing.id },
          data: { ...fields, parentId: parent?.id ?? null, ...completion },
        });
        await auditInTx(tx, ctx, {
          entity: "goal",
          verb: goalTransitionVerb(existing.status, updated.status),
          entityId: id,
          before: goalSnapshot(existing),
          after: goalSnapshot(updated),
        });
        return toGoalDto(updated);
      });
    },

    /**
     * Delete (ADR 0031): refused while child goals exist (move or delete them first). Milestones
     * that counted toward the goal are unlinked, not deleted; joins and measurements cascade.
     */
    delete(ctx: ServiceContext, id: string): Promise<void> {
      return db.$transaction(async (tx) => {
        const existing = await findOwned(tx, ctx.userId, id);
        const children = await tx.goal.count({ where: { userId: ctx.userId, parentId: id } });
        if (children > 0) {
          throw new AppError("CONFLICT", {
            message: `This goal has ${children} child goal${children === 1 ? "" : "s"}. Move or delete ${children === 1 ? "it" : "them"} first.`,
          });
        }
        const milestoneIds = (
          await tx.milestone.findMany({
            where: { userId: ctx.userId, goalId: id },
            select: { id: true },
          })
        ).map((m) => m.id);
        await tx.milestone.updateMany({
          where: { userId: ctx.userId, goalId: id },
          data: { goalId: null },
        });
        await tx.goal.delete({ where: { id: existing.id } });
        await auditInTx(tx, ctx, {
          entity: "goal",
          verb: "deleted",
          entityId: id,
          before: { ...goalSnapshot(existing), unlinkedMilestoneIds: milestoneIds },
        });
      });
    },

    replaceProjects: (ctx: ServiceContext, id: string, ids: string[]) =>
      replaceLinks(ctx, id, "projects", ids),
    replaceSkills: (ctx: ServiceContext, id: string, ids: string[]) =>
      replaceLinks(ctx, id, "skills", ids),
    replaceDependencies: (ctx: ServiceContext, id: string, ids: string[]) =>
      replaceLinks(ctx, id, "dependencies", ids),
    replaceMilestones: (ctx: ServiceContext, id: string, ids: string[]) =>
      replaceLinks(ctx, id, "milestones", ids),

    async listMeasurements(ctx: ServiceContext, goalId: string) {
      await findOwned(db, ctx.userId, goalId);
      const rows = await db.goalMeasurement.findMany({
        where: { userId: ctx.userId, goalId },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        take: MAX_MEASUREMENTS_PER_GOAL,
      });
      return { data: rows.map(measurementDto) };
    },

    /** Record a measured value of the goal's metric. Future dates are rejected (no fabrication). */
    addMeasurement(
      ctx: ServiceContext,
      goalId: string,
      input: { date: Date; value: number; note?: string | null },
    ) {
      const now = clock();
      return db.$transaction(async (tx) => {
        const goal = await findOwned(tx, ctx.userId, goalId);
        if (input.date.getTime() > utcDay(now).getTime()) {
          throw new AppError("VALIDATION_FAILED", {
            details: [{ path: "date", message: "A measurement cannot be dated in the future" }],
          });
        }
        if (goal.baseline === null || goal.target === null) {
          throw new AppError("VALIDATION_FAILED", {
            details: [
              {
                path: "value",
                message: "Set the goal's baseline and target before recording measurements",
              },
            ],
          });
        }
        if (
          (await tx.goalMeasurement.count({ where: { userId: ctx.userId, goalId } })) >=
          MAX_MEASUREMENTS_PER_GOAL
        ) {
          throw new AppError("VALIDATION_FAILED", {
            message: `A goal can have at most ${MAX_MEASUREMENTS_PER_GOAL} measurements.`,
          });
        }
        const m = await tx.goalMeasurement.create({
          data: {
            userId: ctx.userId,
            goalId,
            date: input.date,
            value: input.value,
            note: input.note ?? null,
          },
        });
        await auditInTx(tx, ctx, {
          entity: "goal_measurement",
          verb: "created",
          entityId: m.id,
          after: { goalId, ...measurementDto(m) },
        });
        return measurementDto(m);
      });
    },

    deleteMeasurement(ctx: ServiceContext, goalId: string, measurementId: string): Promise<void> {
      return db.$transaction(async (tx) => {
        await findOwned(tx, ctx.userId, goalId);
        const m = requireFound(
          await tx.goalMeasurement.findFirst({
            where: { id: measurementId, goalId, userId: ctx.userId },
          }),
        );
        await tx.goalMeasurement.delete({ where: { id: m.id } });
        await auditInTx(tx, ctx, {
          entity: "goal_measurement",
          verb: "deleted",
          entityId: m.id,
          before: { goalId, ...measurementDto(m) },
        });
      });
    },
  };
}

export type GoalService = ReturnType<typeof createGoalService>;
