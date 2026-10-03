import type { ArchitectureDecision, PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors/app-error";
import { auditInTx, type Tx } from "@/modules/shared/audit";
import { toDateOnly } from "@/modules/shared/fields";
import { assertAllOwned, requireFound } from "@/modules/shared/ownership-checks";
import type { ServiceContext } from "@/modules/shared/service-context";

import {
  assertTransition,
  createsSupersessionCycle,
  decisionTransitionVerb,
  MAX_ALTERNATIVES_PER_DECISION,
  MAX_DECISIONS_PER_USER,
  resolveDecisionState,
} from "./architecture.rules";
import type {
  AlternativeInput,
  CreateDecisionInput,
  UpdateAlternativeInput,
  UpdateDecisionInput,
} from "./architecture.schemas";

/**
 * Architecture decision records (Phase 7, ADRs 0041–0042). Owner-scoped CRUD with an explicit
 * lifecycle, supersession that never destroys history, replace-set relationships and alternatives.
 * Every mutation is audited in its transaction; composite FKs make cross-owner links impossible.
 */

export function decisionSnapshot(d: ArchitectureDecision) {
  return {
    id: d.id,
    title: d.title,
    context: d.context,
    problem: d.problem,
    constraints: d.constraints,
    decision: d.decision,
    consequences: d.consequences,
    status: d.status,
    decidedAt: toDateOnly(d.decidedAt),
    revisitDate: toDateOnly(d.revisitDate),
    supersededById: d.supersededById,
  };
}

export function toDecisionDto(d: ArchitectureDecision) {
  return {
    ...decisionSnapshot(d),
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}
export type DecisionDto = ReturnType<typeof toDecisionDto>;

async function findOwned(tx: Tx | PrismaClient, userId: string, id: string) {
  return requireFound(await tx.architectureDecision.findFirst({ where: { id, userId } }));
}

/** The superseding decision must be the caller's, not rejected, and must not create a cycle. */
async function assertSuperseder(tx: Tx, userId: string, decisionId: string, supersederId: string) {
  const superseder = await tx.architectureDecision.findFirst({
    where: { id: supersederId, userId },
    select: { id: true, status: true },
  });
  if (!superseder) {
    throw new AppError("VALIDATION_FAILED", {
      details: [{ path: "supersededById", message: "The superseding decision does not exist." }],
    });
  }
  if (superseder.status === "rejected") {
    throw new AppError("VALIDATION_FAILED", {
      details: [
        { path: "supersededById", message: "A rejected decision cannot supersede another." },
      ],
    });
  }
  const chain = await tx.architectureDecision.findMany({
    where: { userId, supersededById: { not: null } },
    select: { id: true, supersededById: true },
  });
  const map = new Map(chain.map((c) => [c.id, c.supersededById]));
  if (createsSupersessionCycle(map, decisionId, supersederId)) {
    throw new AppError("VALIDATION_FAILED", {
      details: [
        {
          path: "supersededById",
          message:
            "Supersession cannot form a cycle (a decision cannot replace its own successor).",
        },
      ],
    });
  }
}

export function createDecisionService(db: PrismaClient, clock: () => Date = () => new Date()) {
  async function replaceLinks(
    ctx: ServiceContext,
    decisionId: string,
    kind: "projects" | "evidence" | "components",
    ids: string[],
  ) {
    return db.$transaction(async (tx) => {
      await findOwned(tx, ctx.userId, decisionId);
      const userId = ctx.userId;
      let before: string[];
      if (kind === "projects") {
        assertAllOwned(
          await tx.project.count({ where: { userId, id: { in: ids } } }),
          ids,
          "projectIds",
        );
        before = (
          await tx.decisionProject.findMany({
            where: { userId, decisionId },
            select: { projectId: true },
          })
        ).map((r) => r.projectId);
        await tx.decisionProject.deleteMany({ where: { userId, decisionId } });
        if (ids.length)
          await tx.decisionProject.createMany({
            data: ids.map((projectId) => ({ userId, decisionId, projectId })),
          });
      } else if (kind === "evidence") {
        assertAllOwned(
          await tx.evidence.count({ where: { userId, id: { in: ids } } }),
          ids,
          "evidenceIds",
        );
        before = (
          await tx.architectureDecisionEvidence.findMany({
            where: { userId, decisionId },
            select: { evidenceId: true },
          })
        ).map((r) => r.evidenceId);
        await tx.architectureDecisionEvidence.deleteMany({ where: { userId, decisionId } });
        if (ids.length)
          await tx.architectureDecisionEvidence.createMany({
            data: ids.map((evidenceId) => ({ userId, decisionId, evidenceId })),
          });
      } else {
        assertAllOwned(
          await tx.architectureComponent.count({ where: { userId, id: { in: ids } } }),
          ids,
          "componentIds",
        );
        before = (
          await tx.decisionComponent.findMany({
            where: { userId, decisionId },
            select: { componentId: true },
          })
        ).map((r) => r.componentId);
        await tx.decisionComponent.deleteMany({ where: { userId, decisionId } });
        if (ids.length)
          await tx.decisionComponent.createMany({
            data: ids.map((componentId) => ({ userId, decisionId, componentId })),
          });
      }
      const key =
        kind === "projects" ? "projectIds" : kind === "evidence" ? "evidenceIds" : "componentIds";
      await auditInTx(tx, ctx, {
        entity: "architecture_decision",
        verb: "relations_updated",
        entityId: decisionId,
        before: { [key]: [...before].sort() },
        after: { [key]: [...ids].sort() },
      });
      return toDecisionDto(await findOwned(tx, userId, decisionId));
    });
  }

  return {
    async get(ctx: ServiceContext, id: string) {
      return toDecisionDto(await findOwned(db, ctx.userId, id));
    },

    create(ctx: ServiceContext, input: CreateDecisionInput) {
      const now = clock();
      return db.$transaction(async (tx) => {
        if (
          (await tx.architectureDecision.count({ where: { userId: ctx.userId } })) >=
          MAX_DECISIONS_PER_USER
        ) {
          throw new AppError("VALIDATION_FAILED", {
            message: `You can have at most ${MAX_DECISIONS_PER_USER} architecture decisions.`,
          });
        }
        const status = input.status ?? "proposed";
        const state = resolveDecisionState(
          { status, decidedAt: input.decidedAt, supersededById: null },
          now,
        );
        const created = await tx.architectureDecision.create({
          data: {
            userId: ctx.userId,
            title: input.title,
            context: input.context ?? null,
            problem: input.problem ?? null,
            constraints: input.constraints ?? null,
            decision: input.decision ?? null,
            consequences: input.consequences ?? null,
            status,
            decidedAt: state.decidedAt,
            revisitDate: input.revisitDate ?? null,
          },
        });
        await auditInTx(tx, ctx, {
          entity: "architecture_decision",
          verb: "created",
          entityId: created.id,
          after: decisionSnapshot(created),
        });
        return toDecisionDto(created);
      });
    },

    update(ctx: ServiceContext, id: string, input: UpdateDecisionInput) {
      const now = clock();
      return db.$transaction(async (tx) => {
        const before = await findOwned(tx, ctx.userId, id);
        const status = input.status ?? before.status;
        if (input.status) assertTransition(before.status, input.status);
        const supersededById =
          input.supersededById !== undefined ? input.supersededById : before.supersededById;
        if (status === "superseded" && supersededById && supersededById !== before.supersededById) {
          await assertSuperseder(tx, ctx.userId, id, supersededById);
        }
        const state = resolveDecisionState(
          {
            status,
            // Reconsidering a rejected decision clears its date; otherwise keep the recorded one.
            decidedAt: input.decidedAt !== undefined ? input.decidedAt : before.decidedAt,
            supersededById,
          },
          now,
        );
        const updated = await tx.architectureDecision.update({
          where: { id },
          data: {
            title: input.title,
            context: input.context,
            problem: input.problem,
            constraints: input.constraints,
            decision: input.decision,
            consequences: input.consequences,
            revisitDate: input.revisitDate !== undefined ? input.revisitDate : undefined,
            status,
            decidedAt: state.decidedAt,
            supersededById: state.supersededById,
          },
        });
        await auditInTx(tx, ctx, {
          entity: "architecture_decision",
          verb: decisionTransitionVerb(before.status, updated.status),
          entityId: id,
          before: decisionSnapshot(before),
          after: decisionSnapshot(updated),
        });
        return toDecisionDto(updated);
      });
    },

    /** Refused while the decision supersedes others — that history must not be orphaned. */
    delete(ctx: ServiceContext, id: string) {
      return db.$transaction(async (tx) => {
        const before = await findOwned(tx, ctx.userId, id);
        const supersedes = await tx.architectureDecision.count({
          where: { userId: ctx.userId, supersededById: id },
        });
        if (supersedes > 0) {
          throw new AppError("CONFLICT", {
            message: `This decision supersedes ${supersedes} other decision${supersedes === 1 ? "" : "s"}. Reinstate ${supersedes === 1 ? "it" : "them"} first to keep the history intact.`,
          });
        }
        await tx.architectureDecision.delete({ where: { id } });
        await auditInTx(tx, ctx, {
          entity: "architecture_decision",
          verb: "deleted",
          entityId: id,
          before: decisionSnapshot(before),
        });
      });
    },

    replaceProjects: (ctx: ServiceContext, id: string, ids: string[]) =>
      replaceLinks(ctx, id, "projects", ids),
    replaceEvidence: (ctx: ServiceContext, id: string, ids: string[]) =>
      replaceLinks(ctx, id, "evidence", ids),
    replaceComponents: (ctx: ServiceContext, id: string, ids: string[]) =>
      replaceLinks(ctx, id, "components", ids),

    // ── Alternatives (04 ArchitectureAlternative) ─────────────────────────────

    addAlternative(ctx: ServiceContext, decisionId: string, input: AlternativeInput) {
      return db.$transaction(async (tx) => {
        await findOwned(tx, ctx.userId, decisionId);
        const count = await tx.architectureAlternative.count({
          where: { userId: ctx.userId, decisionId },
        });
        if (count >= MAX_ALTERNATIVES_PER_DECISION) {
          throw new AppError("VALIDATION_FAILED", {
            message: `A decision can have at most ${MAX_ALTERNATIVES_PER_DECISION} alternatives.`,
          });
        }
        const created = await tx.architectureAlternative.create({
          data: {
            userId: ctx.userId,
            decisionId,
            name: input.name,
            pros: input.pros ?? null,
            cons: input.cons ?? null,
            rejectedReason: input.rejectedReason ?? null,
          },
        });
        await auditInTx(tx, ctx, {
          entity: "architecture_alternative",
          verb: "created",
          entityId: created.id,
          after: { decisionId, name: created.name },
        });
        return alternativeDto(created);
      });
    },

    updateAlternative(
      ctx: ServiceContext,
      decisionId: string,
      altId: string,
      input: UpdateAlternativeInput,
    ) {
      return db.$transaction(async (tx) => {
        const before = requireFound(
          await tx.architectureAlternative.findFirst({
            where: { id: altId, decisionId, userId: ctx.userId },
          }),
        );
        const updated = await tx.architectureAlternative.update({
          where: { id: altId },
          data: input,
        });
        await auditInTx(tx, ctx, {
          entity: "architecture_alternative",
          verb: "updated",
          entityId: altId,
          before: { decisionId, name: before.name },
          after: { decisionId, name: updated.name },
        });
        return alternativeDto(updated);
      });
    },

    deleteAlternative(ctx: ServiceContext, decisionId: string, altId: string) {
      return db.$transaction(async (tx) => {
        const before = requireFound(
          await tx.architectureAlternative.findFirst({
            where: { id: altId, decisionId, userId: ctx.userId },
          }),
        );
        await tx.architectureAlternative.delete({ where: { id: altId } });
        await auditInTx(tx, ctx, {
          entity: "architecture_alternative",
          verb: "deleted",
          entityId: altId,
          before: { decisionId, name: before.name },
        });
      });
    },
  };
}

function alternativeDto(a: {
  id: string;
  name: string;
  pros: string | null;
  cons: string | null;
  rejectedReason: string | null;
}) {
  return { id: a.id, name: a.name, pros: a.pros, cons: a.cons, rejectedReason: a.rejectedReason };
}

export type DecisionService = ReturnType<typeof createDecisionService>;
