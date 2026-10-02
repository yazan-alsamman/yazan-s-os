import type { PrismaClient } from "@/generated/prisma/client";
import { paginated } from "@/lib/http/pagination";
import { auditInTx, type Tx } from "@/modules/shared/audit";
import { assertAllOwned, assertDateOrder, requireFound } from "@/modules/shared/ownership-checks";
import type { ServiceContext } from "@/modules/shared/service-context";

import {
  experienceRepository as repo,
  toExperienceDetailDto,
  toExperienceDto,
  toExperienceListItem,
  type ExperienceDetailDto,
} from "./experience.repository";
import type {
  CreateExperienceInput,
  ListExperiencesQuery,
  UpdateExperienceInput,
} from "./experience.schemas";

export function createExperienceService(db: PrismaClient) {
  async function getDetail(tx: Tx | PrismaClient, userId: string, id: string) {
    return toExperienceDetailDto(requireFound(await repo.findOwnedDetail(tx, userId, id)));
  }

  async function evidenceIds(tx: Tx, userId: string, experienceId: string) {
    const links = await tx.experienceEvidence.findMany({
      where: { userId, experienceId },
      orderBy: { evidenceId: "asc" },
    });
    return links.map((l) => l.evidenceId);
  }

  return {
    async list(ctx: ServiceContext, query: ListExperiencesQuery) {
      const { rows, total } = await repo.list(db, ctx.userId, query);
      return paginated(rows.map(toExperienceListItem), total, query);
    },

    get(ctx: ServiceContext, id: string): Promise<ExperienceDetailDto> {
      return getDetail(db, ctx.userId, id);
    },

    create(ctx: ServiceContext, input: CreateExperienceInput): Promise<ExperienceDetailDto> {
      return db.$transaction(async (tx) => {
        assertDateOrder(input.startDate, input.endDate, "endDate");
        const experience = await tx.experience.create({
          data: {
            ...input,
            achievements: input.achievements ?? [],
            userId: ctx.userId,
            origin: "manual",
          },
        });
        await auditInTx(tx, ctx, {
          entity: "experience",
          verb: "created",
          entityId: experience.id,
          after: toExperienceDto(experience),
        });
        return getDetail(tx, ctx.userId, experience.id);
      });
    },

    update(
      ctx: ServiceContext,
      id: string,
      input: UpdateExperienceInput,
    ): Promise<ExperienceDetailDto> {
      return db.$transaction(async (tx) => {
        const existing = requireFound(await repo.findOwned(tx, ctx.userId, id));
        assertDateOrder(
          input.startDate ?? existing.startDate,
          input.endDate !== undefined ? input.endDate : existing.endDate,
          "endDate",
        );
        const updated = await tx.experience.update({ where: { id: existing.id }, data: input });
        await auditInTx(tx, ctx, {
          entity: "experience",
          verb: "updated",
          entityId: id,
          before: toExperienceDto(existing),
          after: toExperienceDto(updated),
        });
        return getDetail(tx, ctx.userId, id);
      });
    },

    delete(ctx: ServiceContext, id: string): Promise<void> {
      return db.$transaction(async (tx) => {
        const existing = requireFound(await repo.findOwned(tx, ctx.userId, id));
        const links = await evidenceIds(tx, ctx.userId, id);
        await tx.experience.delete({ where: { id: existing.id } });
        await auditInTx(tx, ctx, {
          entity: "experience",
          verb: "deleted",
          entityId: id,
          before: { ...toExperienceDto(existing), evidenceIds: links },
        });
      });
    },

    /** Replace the experience's evidence links (spec 04 Experience.evidenceLinks). */
    replaceEvidence(ctx: ServiceContext, id: string, ids: string[]): Promise<ExperienceDetailDto> {
      return db.$transaction(async (tx) => {
        requireFound(await repo.findOwned(tx, ctx.userId, id));
        const owned = await tx.evidence.count({ where: { userId: ctx.userId, id: { in: ids } } });
        assertAllOwned(owned, ids, "evidenceIds");
        const before = await evidenceIds(tx, ctx.userId, id);
        await tx.experienceEvidence.deleteMany({ where: { userId: ctx.userId, experienceId: id } });
        if (ids.length) {
          await tx.experienceEvidence.createMany({
            data: ids.map((evidenceId) => ({ userId: ctx.userId, experienceId: id, evidenceId })),
          });
        }
        await auditInTx(tx, ctx, {
          entity: "experience",
          verb: "relations_updated",
          entityId: id,
          before: { evidenceIds: before },
          after: { evidenceIds: await evidenceIds(tx, ctx.userId, id) },
        });
        return getDetail(tx, ctx.userId, id);
      });
    },
  };
}
