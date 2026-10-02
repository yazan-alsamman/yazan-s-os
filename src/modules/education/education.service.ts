import type { Education, Prisma, PrismaClient } from "@/generated/prisma/client";
import { escapeLike } from "@/lib/db/errors";
import { paginated, toSkipTake } from "@/lib/http/pagination";
import { auditInTx, type Tx } from "@/modules/shared/audit";
import { toDateOnly } from "@/modules/shared/fields";
import { assertDateOrder, requireFound } from "@/modules/shared/ownership-checks";
import { provenanceInclude, toProvenance } from "@/modules/shared/provenance";
import type { ServiceContext } from "@/modules/shared/service-context";

import type {
  CreateEducationInput,
  ListEducationQuery,
  UpdateEducationInput,
} from "./education.schemas";

type Db = PrismaClient | Tx;

export function toEducationDto(education: Education) {
  return {
    id: education.id,
    institution: education.institution,
    degree: education.degree,
    fieldOfStudy: education.fieldOfStudy,
    startDate: toDateOnly(education.startDate),
    endDate: toDateOnly(education.endDate),
    description: education.description,
    achievements: education.achievements,
    origin: education.origin,
    createdAt: education.createdAt.toISOString(),
    updatedAt: education.updatedAt.toISOString(),
  };
}

export type EducationDto = ReturnType<typeof toEducationDto>;

/** Education repository (owner-scoped). */
export const educationRepository = {
  findOwned(db: Db, userId: string, id: string) {
    return db.education.findFirst({ where: { id, userId } });
  },
  findOwnedDetail(db: Db, userId: string, id: string) {
    return db.education.findFirst({ where: { id, userId }, include: provenanceInclude });
  },
  async list(db: Db, userId: string, query: ListEducationQuery) {
    const where: Prisma.EducationWhereInput = { userId };
    if (query.q) {
      const term = { contains: escapeLike(query.q), mode: "insensitive" as const };
      where.OR = [
        { institution: term },
        { degree: term },
        { fieldOfStudy: term },
        { description: term },
      ];
    }
    const [rows, total] = await Promise.all([
      db.education.findMany({
        where,
        orderBy: query.sort as Prisma.EducationOrderByWithRelationInput[],
        ...toSkipTake(query),
      }),
      db.education.count({ where }),
    ]);
    return { rows, total };
  },
};

const repo = educationRepository;

export function createEducationService(db: PrismaClient) {
  async function getDetail(tx: Db, userId: string, id: string) {
    const record = requireFound(await repo.findOwnedDetail(tx, userId, id));
    return { ...toEducationDto(record), provenance: toProvenance(record) };
  }

  return {
    async list(ctx: ServiceContext, query: ListEducationQuery) {
      const { rows, total } = await repo.list(db, ctx.userId, query);
      return paginated(rows.map(toEducationDto), total, query);
    },

    get(ctx: ServiceContext, id: string) {
      return getDetail(db, ctx.userId, id);
    },

    create(ctx: ServiceContext, input: CreateEducationInput) {
      return db.$transaction(async (tx) => {
        assertDateOrder(input.startDate, input.endDate, "endDate");
        const education = await tx.education.create({
          data: {
            ...input,
            achievements: input.achievements ?? [],
            userId: ctx.userId,
            origin: "manual",
          },
        });
        await auditInTx(tx, ctx, {
          entity: "education",
          verb: "created",
          entityId: education.id,
          after: toEducationDto(education),
        });
        return getDetail(tx, ctx.userId, education.id);
      });
    },

    update(ctx: ServiceContext, id: string, input: UpdateEducationInput) {
      return db.$transaction(async (tx) => {
        const existing = requireFound(await repo.findOwned(tx, ctx.userId, id));
        assertDateOrder(
          input.startDate !== undefined ? input.startDate : existing.startDate,
          input.endDate !== undefined ? input.endDate : existing.endDate,
          "endDate",
        );
        const updated = await tx.education.update({ where: { id: existing.id }, data: input });
        await auditInTx(tx, ctx, {
          entity: "education",
          verb: "updated",
          entityId: id,
          before: toEducationDto(existing),
          after: toEducationDto(updated),
        });
        return getDetail(tx, ctx.userId, id);
      });
    },

    delete(ctx: ServiceContext, id: string): Promise<void> {
      return db.$transaction(async (tx) => {
        const existing = requireFound(await repo.findOwned(tx, ctx.userId, id));
        await tx.education.delete({ where: { id: existing.id } });
        await auditInTx(tx, ctx, {
          entity: "education",
          verb: "deleted",
          entityId: id,
          before: toEducationDto(existing),
        });
      });
    },
  };
}
