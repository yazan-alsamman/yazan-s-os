import type { PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors/app-error";
import { paginated } from "@/lib/http/pagination";
import { auditInTx, type Tx } from "@/modules/shared/audit";
import { normalizeKey } from "@/modules/shared/fields";
import { assertAllOwned, requireFound } from "@/modules/shared/ownership-checks";
import type { ServiceContext } from "@/modules/shared/service-context";

import { CUSTOM_LEVEL_MODEL_ID, DEFAULT_LEVEL_MODEL_ID, isValidLevel } from "./level-models";
import {
  skillRepository as repo,
  toSkillDetailDto,
  toSkillDto,
  toSkillListItem,
  type SkillDetailDto,
} from "./skill.repository";
import type {
  CreateSkillInput,
  ListSkillsQuery,
  SkillEvidenceLinkInput,
  UpdateSkillInput,
} from "./skill.schemas";

function duplicateName(): AppError {
  return new AppError("CONFLICT", {
    message: "You already have a skill with this name.",
    details: [{ path: "name", message: "Already exists" }],
  });
}

/**
 * Resolve the stored level model for a create/update. A custom model must belong to the caller
 * (also enforced by the composite FK); a foreign or unknown id is reported like a missing one.
 */
async function resolveLevelModel(
  tx: Tx,
  userId: string,
  input: { levelModel?: string; levelModelId?: string | null },
  existing?: { levelModel: string; levelModelId: string | null },
): Promise<{ levelModel: string; levelModelId: string | null }> {
  if (input.levelModelId !== undefined && input.levelModelId !== null) {
    const owned = await tx.skillLevelModel.findFirst({
      where: { id: input.levelModelId, userId },
      select: { id: true },
    });
    if (!owned) {
      throw new AppError("VALIDATION_FAILED", {
        details: [{ path: "levelModelId", message: "Unknown level model" }],
      });
    }
    return { levelModel: CUSTOM_LEVEL_MODEL_ID, levelModelId: owned.id };
  }
  if (input.levelModelId === null || input.levelModel !== undefined) {
    return { levelModel: input.levelModel ?? DEFAULT_LEVEL_MODEL_ID, levelModelId: null };
  }
  return existing
    ? { levelModel: existing.levelModel, levelModelId: existing.levelModelId }
    : { levelModel: DEFAULT_LEVEL_MODEL_ID, levelModelId: null };
}

export function createSkillService(db: PrismaClient) {
  async function getDetail(tx: Tx | PrismaClient, userId: string, id: string) {
    return toSkillDetailDto(requireFound(await repo.findOwnedDetail(tx, userId, id)));
  }

  async function evidenceSnapshot(tx: Tx, userId: string, skillId: string) {
    const links = await tx.skillEvidence.findMany({
      where: { userId, skillId },
      orderBy: { evidenceId: "asc" },
    });
    return links.map((l) => ({ evidenceId: l.evidenceId, strength: l.strength, date: l.date }));
  }

  return {
    async list(ctx: ServiceContext, query: ListSkillsQuery) {
      const { rows, total } = await repo.list(db, ctx.userId, query);
      return paginated(rows.map(toSkillListItem), total, query);
    },

    categories(ctx: ServiceContext) {
      return repo.categories(db, ctx.userId);
    },

    get(ctx: ServiceContext, id: string): Promise<SkillDetailDto> {
      return getDetail(db, ctx.userId, id);
    },

    create(ctx: ServiceContext, input: CreateSkillInput): Promise<SkillDetailDto> {
      return db.$transaction(async (tx) => {
        const key = normalizeKey(input.name);
        if (await repo.keyTaken(tx, ctx.userId, key)) throw duplicateName();
        const model = await resolveLevelModel(tx, ctx.userId, input);
        const { levelModel: _m, levelModelId: _id, ...fields } = input;
        const skill = await tx.skill.create({
          data: { ...fields, ...model, key, userId: ctx.userId, origin: "manual" },
        });
        await auditInTx(tx, ctx, {
          entity: "skill",
          verb: "created",
          entityId: skill.id,
          after: toSkillDto(skill),
        });
        return getDetail(tx, ctx.userId, skill.id);
      });
    },

    update(ctx: ServiceContext, id: string, input: UpdateSkillInput): Promise<SkillDetailDto> {
      return db.$transaction(async (tx) => {
        const existing = requireFound(await repo.findOwned(tx, ctx.userId, id));
        const model = await resolveLevelModel(tx, ctx.userId, input, existing);
        const levelModel = model.levelModel;
        const targetLevel =
          input.targetLevel !== undefined ? input.targetLevel : existing.targetLevel;
        if (targetLevel !== null && !isValidLevel(levelModel, targetLevel)) {
          throw new AppError("VALIDATION_FAILED", {
            details: [
              { path: "targetLevel", message: "Target level is not part of the level model" },
            ],
          });
        }
        const { levelModel: _m, levelModelId: _id, ...fields } = input;
        const data: Omit<UpdateSkillInput, "levelModel" | "levelModelId"> & {
          key?: string;
          levelModel: string;
          levelModelId: string | null;
        } = { ...fields, ...model };
        if (input.name) {
          data.key = normalizeKey(input.name);
          if (await repo.keyTaken(tx, ctx.userId, data.key, id)) throw duplicateName();
        }
        const updated = await tx.skill.update({ where: { id: existing.id }, data });
        await auditInTx(tx, ctx, {
          entity: "skill",
          verb: "updated",
          entityId: id,
          before: toSkillDto(existing),
          after: toSkillDto(updated),
        });
        return getDetail(tx, ctx.userId, id);
      });
    },

    /** Replace the skill's explicit technology links (ADR 0030), audited as a relationship change. */
    replaceTechnologies(ctx: ServiceContext, id: string, technologyIds: string[]) {
      return db.$transaction(async (tx) => {
        requireFound(await repo.findOwned(tx, ctx.userId, id));
        const owned = await tx.technology.count({
          where: { userId: ctx.userId, id: { in: technologyIds } },
        });
        assertAllOwned(owned, technologyIds, "technologyIds");
        const before = (
          await tx.technologySkill.findMany({
            where: { userId: ctx.userId, skillId: id },
            orderBy: { technologyId: "asc" },
          })
        ).map((l) => l.technologyId);
        await tx.technologySkill.deleteMany({ where: { userId: ctx.userId, skillId: id } });
        if (technologyIds.length) {
          await tx.technologySkill.createMany({
            data: technologyIds.map((technologyId) => ({
              userId: ctx.userId,
              skillId: id,
              technologyId,
            })),
          });
        }
        await auditInTx(tx, ctx, {
          entity: "skill",
          verb: "relations_updated",
          entityId: id,
          before: { technologyIds: before },
          after: { technologyIds: [...technologyIds].sort() },
        });
        return getDetail(tx, ctx.userId, id);
      });
    },

    delete(ctx: ServiceContext, id: string): Promise<void> {
      return db.$transaction(async (tx) => {
        const existing = requireFound(await repo.findOwned(tx, ctx.userId, id));
        await tx.skill.delete({ where: { id: existing.id } });
        await auditInTx(tx, ctx, {
          entity: "skill",
          verb: "deleted",
          entityId: id,
          before: toSkillDto(existing),
        });
      });
    },

    /** Replace the skill's evidence links (with strength and date). */
    replaceEvidence(
      ctx: ServiceContext,
      id: string,
      items: SkillEvidenceLinkInput[],
    ): Promise<SkillDetailDto> {
      return db.$transaction(async (tx) => {
        requireFound(await repo.findOwned(tx, ctx.userId, id));
        const ids = items.map((i) => i.evidenceId);
        const owned = await tx.evidence.count({ where: { userId: ctx.userId, id: { in: ids } } });
        assertAllOwned(owned, ids, "evidence");
        const before = await evidenceSnapshot(tx, ctx.userId, id);
        await tx.skillEvidence.deleteMany({ where: { userId: ctx.userId, skillId: id } });
        if (items.length) {
          await tx.skillEvidence.createMany({
            data: items.map((item) => ({
              userId: ctx.userId,
              skillId: id,
              evidenceId: item.evidenceId,
              strength: item.strength,
              date: item.date ?? null,
            })),
          });
        }
        await auditInTx(tx, ctx, {
          entity: "skill",
          verb: "relations_updated",
          entityId: id,
          before: { evidence: before },
          after: { evidence: await evidenceSnapshot(tx, ctx.userId, id) },
        });
        return getDetail(tx, ctx.userId, id);
      });
    },
  };
}

export type SkillService = ReturnType<typeof createSkillService>;
