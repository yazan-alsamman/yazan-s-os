import type { PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors/app-error";
import { paginated } from "@/lib/http/pagination";
import { auditInTx } from "@/modules/shared/audit";
import { requireFound } from "@/modules/shared/ownership-checks";
import type { ServiceContext } from "@/modules/shared/service-context";

import {
  milestoneInclude,
  milestoneRepository as repo,
  milestoneSnapshot,
  toMilestoneDto,
} from "./milestone.repository";
import { MAX_MILESTONES_PER_PROJECT, resolveCompletion, transitionVerb } from "./milestone.rules";
import type {
  CreateMilestoneInput,
  ListMilestonesQuery,
  UpdateMilestoneInput,
} from "./milestone.schemas";

/**
 * Milestones (ADR 0022). Every query is owner-scoped; a milestone can only be created under a
 * project the caller owns (and the composite FK (project_id, user_id) enforces it in the database).
 * Mutations are audited in the same transaction. `now` is injectable for deterministic tests.
 */
export function createMilestoneService(db: PrismaClient, clock: () => Date = () => new Date()) {
  async function list(ctx: ServiceContext, query: ListMilestonesQuery) {
    const today = clock();
    const { rows, total } = await repo.list(db, ctx.userId, query, today);
    return paginated(
      rows.map((m) => toMilestoneDto(m, today)),
      total,
      query,
    );
  }

  return {
    list,

    /** Milestones of one project; 404 when the project is not the caller's. */
    async listForProject(
      ctx: ServiceContext,
      projectId: string,
      query: Omit<ListMilestonesQuery, "projectId">,
    ) {
      requireFound(
        await db.project.findFirst({
          where: { id: projectId, userId: ctx.userId },
          select: { id: true },
        }),
      );
      return list(ctx, { ...query, projectId });
    },

    async get(ctx: ServiceContext, id: string) {
      return toMilestoneDto(requireFound(await repo.findOwned(db, ctx.userId, id)), clock());
    },

    create(ctx: ServiceContext, projectId: string, input: CreateMilestoneInput) {
      const today = clock();
      return db.$transaction(async (tx) => {
        requireFound(
          await tx.project.findFirst({
            where: { id: projectId, userId: ctx.userId },
            select: { id: true },
          }),
        );
        const count = await tx.milestone.count({ where: { userId: ctx.userId, projectId } });
        if (count >= MAX_MILESTONES_PER_PROJECT) {
          throw new AppError("VALIDATION_FAILED", {
            message: `A project can have at most ${MAX_MILESTONES_PER_PROJECT} milestones.`,
          });
        }
        const completion = resolveCompletion(
          { status: input.status ?? "planned", completedAt: input.completedAt },
          today,
        );
        const milestone = await tx.milestone.create({
          include: milestoneInclude,
          data: {
            userId: ctx.userId,
            projectId,
            title: input.title,
            dueDate: input.dueDate ?? null,
            ...completion,
          },
        });
        await auditInTx(tx, ctx, {
          entity: "milestone",
          verb: "created",
          entityId: milestone.id,
          after: milestoneSnapshot(milestone),
        });
        return toMilestoneDto(milestone, today);
      });
    },

    update(ctx: ServiceContext, id: string, input: UpdateMilestoneInput) {
      const today = clock();
      return db.$transaction(async (tx) => {
        const existing = requireFound(await repo.findOwned(tx, ctx.userId, id));
        const status = input.status ?? existing.status;
        // Keep the stored completion date when only other fields change on a completed milestone.
        const completedAt =
          input.completedAt !== undefined
            ? input.completedAt
            : status === "completed" && existing.status === "completed"
              ? existing.completedAt
              : null;
        const completion = resolveCompletion({ status, completedAt }, today);
        const updated = await tx.milestone.update({
          where: { id: existing.id },
          include: milestoneInclude,
          data: {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
            ...completion,
          },
        });
        await auditInTx(tx, ctx, {
          entity: "milestone",
          verb: transitionVerb(existing.status, updated.status),
          entityId: id,
          before: milestoneSnapshot(existing),
          after: milestoneSnapshot(updated),
        });
        return toMilestoneDto(updated, today);
      });
    },

    /** Hard delete (PEOS convention); the audit entry keeps the final state. */
    delete(ctx: ServiceContext, id: string): Promise<void> {
      return db.$transaction(async (tx) => {
        const existing = requireFound(await repo.findOwned(tx, ctx.userId, id));
        await tx.milestone.delete({ where: { id: existing.id } });
        await auditInTx(tx, ctx, {
          entity: "milestone",
          verb: "deleted",
          entityId: id,
          before: milestoneSnapshot(existing),
        });
      });
    },
  };
}

export type MilestoneService = ReturnType<typeof createMilestoneService>;
