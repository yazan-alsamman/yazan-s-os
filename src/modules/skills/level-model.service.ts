import { z } from "zod";

import type { PrismaClient, SkillLevelModel } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors/app-error";
import { auditInTx } from "@/modules/shared/audit";
import { optionalText, requiredText } from "@/modules/shared/fields";
import { requireFound } from "@/modules/shared/ownership-checks";
import type { ServiceContext } from "@/modules/shared/service-context";

import { CANONICAL_LEVEL_VALUES, DEFAULT_LEVEL_MODEL, type SkillLevel } from "./level-models";

/**
 * Custom skill level models (ADR 0026): a user's own names and descriptions for the canonical,
 * ordered 0–5 scale. The values are fixed because skill-level-v1 defines its evidence rules per
 * canonical value; a model therefore cannot be malformed (wrong count, gaps, duplicates, reordering).
 */
export const MAX_LEVEL_MODELS = 20;

const levelSchema = z.object({
  value: z.number().int(),
  label: requiredText(60),
  description: optionalText(300),
});

export const levelModelInputSchema = z.object({
  name: requiredText(80),
  levels: z
    .array(levelSchema)
    .length(CANONICAL_LEVEL_VALUES.length, "Define exactly six levels (0–5)")
    .refine(
      (levels) => levels.every((l, i) => l.value === CANONICAL_LEVEL_VALUES[i]),
      "Levels must be the values 0, 1, 2, 3, 4, 5 in order",
    ),
});

export const levelModelUpdateSchema = levelModelInputSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update");

export type LevelModelInput = z.infer<typeof levelModelInputSchema>;

export function toLevelModelDto(model: SkillLevelModel, usedBy?: number) {
  return {
    id: model.id,
    name: model.name,
    levels: model.levels as unknown as SkillLevel[],
    ...(usedBy !== undefined ? { usedBy } : {}),
    createdAt: model.createdAt.toISOString(),
    updatedAt: model.updatedAt.toISOString(),
  };
}

export type LevelModelDto = ReturnType<typeof toLevelModelDto>;

const snapshot = (m: SkillLevelModel) => ({ id: m.id, name: m.name, levels: m.levels });

function duplicate(): AppError {
  return new AppError("CONFLICT", {
    message: "You already have a level model with this name.",
    details: [{ path: "name", message: "Already exists" }],
  });
}

const normalise = (levels: LevelModelInput["levels"]) =>
  levels.map((l) => ({ value: l.value, label: l.label, description: l.description ?? null }));

export function createLevelModelService(db: PrismaClient) {
  return {
    /** The built-in default plus the caller's custom models (with the number of skills using each). */
    async list(ctx: ServiceContext) {
      const [models, usage] = await Promise.all([
        db.skillLevelModel.findMany({
          where: { userId: ctx.userId },
          orderBy: [{ name: "asc" }, { id: "asc" }],
        }),
        db.skill.groupBy({
          by: ["levelModelId"],
          where: { userId: ctx.userId, levelModelId: { not: null } },
          _count: { _all: true },
        }),
      ]);
      const used = new Map(usage.map((u) => [u.levelModelId, u._count._all]));
      return {
        data: {
          default: DEFAULT_LEVEL_MODEL,
          custom: models.map((m) => toLevelModelDto(m, used.get(m.id) ?? 0)),
        },
      };
    },

    async get(ctx: ServiceContext, id: string) {
      return toLevelModelDto(
        requireFound(await db.skillLevelModel.findFirst({ where: { id, userId: ctx.userId } })),
      );
    },

    create(ctx: ServiceContext, input: LevelModelInput) {
      return db.$transaction(async (tx) => {
        const count = await tx.skillLevelModel.count({ where: { userId: ctx.userId } });
        if (count >= MAX_LEVEL_MODELS) {
          throw new AppError("VALIDATION_FAILED", {
            message: `You can have at most ${MAX_LEVEL_MODELS} level models.`,
          });
        }
        if (await tx.skillLevelModel.count({ where: { userId: ctx.userId, name: input.name } })) {
          throw duplicate();
        }
        const model = await tx.skillLevelModel.create({
          data: { userId: ctx.userId, name: input.name, levels: normalise(input.levels) },
        });
        await auditInTx(tx, ctx, {
          entity: "skill_level_model",
          verb: "created",
          entityId: model.id,
          after: snapshot(model),
        });
        return toLevelModelDto(model);
      });
    },

    update(ctx: ServiceContext, id: string, input: Partial<LevelModelInput>) {
      return db.$transaction(async (tx) => {
        const existing = requireFound(
          await tx.skillLevelModel.findFirst({ where: { id, userId: ctx.userId } }),
        );
        if (
          input.name &&
          input.name !== existing.name &&
          (await tx.skillLevelModel.count({ where: { userId: ctx.userId, name: input.name } }))
        ) {
          throw duplicate();
        }
        const updated = await tx.skillLevelModel.update({
          where: { id: existing.id },
          data: {
            ...(input.name ? { name: input.name } : {}),
            ...(input.levels ? { levels: normalise(input.levels) } : {}),
          },
        });
        await auditInTx(tx, ctx, {
          entity: "skill_level_model",
          verb: "updated",
          entityId: id,
          before: snapshot(existing),
          after: snapshot(updated),
        });
        return toLevelModelDto(updated);
      });
    },

    /** Deleting a model that skills still use is refused (409); reassign those skills first. */
    delete(ctx: ServiceContext, id: string): Promise<void> {
      return db.$transaction(async (tx) => {
        const existing = requireFound(
          await tx.skillLevelModel.findFirst({ where: { id, userId: ctx.userId } }),
        );
        const used = await tx.skill.count({ where: { userId: ctx.userId, levelModelId: id } });
        if (used > 0) {
          throw new AppError("CONFLICT", {
            message: `${used} skill${used === 1 ? " uses" : "s use"} this level model. Move ${used === 1 ? "it" : "them"} to another model first.`,
          });
        }
        await tx.skillLevelModel.delete({ where: { id: existing.id } });
        await auditInTx(tx, ctx, {
          entity: "skill_level_model",
          verb: "deleted",
          entityId: id,
          before: snapshot(existing),
        });
      });
    },
  };
}
