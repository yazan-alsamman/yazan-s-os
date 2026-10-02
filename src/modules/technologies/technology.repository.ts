import type { Prisma, PrismaClient, Technology } from "@/generated/prisma/client";
import { escapeLike } from "@/lib/db/errors";
import { toSkipTake } from "@/lib/http/pagination";
import type { Tx } from "@/modules/shared/audit";
import { provenanceInclude, toProvenance } from "@/modules/shared/provenance";

import type { ListTechnologiesQuery } from "./technology.schemas";

type Db = PrismaClient | Tx;

export const technologyDetailInclude = {
  ...provenanceInclude,
  usages: {
    include: { project: { select: { id: true, name: true, status: true } } },
    orderBy: { project: { name: "asc" } },
  },
} satisfies Prisma.TechnologyInclude;

type TechnologyDetailRecord = Prisma.TechnologyGetPayload<{
  include: typeof technologyDetailInclude;
}>;

export const technologyRepository = {
  findOwned(db: Db, userId: string, id: string) {
    return db.technology.findFirst({ where: { id, userId } });
  },

  findOwnedDetail(db: Db, userId: string, id: string) {
    return db.technology.findFirst({ where: { id, userId }, include: technologyDetailInclude });
  },

  keyTaken(db: Db, userId: string, key: string, exceptId?: string) {
    return db.technology
      .count({ where: { userId, key, ...(exceptId ? { id: { not: exceptId } } : {}) } })
      .then((n) => n > 0);
  },

  async list(db: Db, userId: string, query: ListTechnologiesQuery) {
    const where: Prisma.TechnologyWhereInput = { userId };
    if (query.q) {
      const term = { contains: escapeLike(query.q), mode: "insensitive" as const };
      where.OR = [{ name: term }, { category: term }, { version: term }, { notes: term }];
    }
    if (query.category) where.category = { equals: query.category, mode: "insensitive" };
    const [rows, total] = await Promise.all([
      db.technology.findMany({
        where,
        orderBy: query.sort as Prisma.TechnologyOrderByWithRelationInput[],
        ...toSkipTake(query),
        include: { _count: { select: { usages: true } } },
      }),
      db.technology.count({ where }),
    ]);
    return { rows, total };
  },
};

export function toTechnologyDto(technology: Technology) {
  return {
    id: technology.id,
    name: technology.name,
    category: technology.category,
    version: technology.version,
    notes: technology.notes,
    origin: technology.origin,
    createdAt: technology.createdAt.toISOString(),
    updatedAt: technology.updatedAt.toISOString(),
  };
}

export function toTechnologyListItem(technology: Technology & { _count: { usages: number } }) {
  return { ...toTechnologyDto(technology), counts: { projects: technology._count.usages } };
}

export type TechnologyListItem = ReturnType<typeof toTechnologyListItem>;

export function toTechnologyDetailDto(technology: TechnologyDetailRecord) {
  return {
    ...toTechnologyDto(technology),
    provenance: toProvenance(technology),
    projects: technology.usages.map((usage) => ({
      ...usage.project,
      usageType: usage.usageType,
      proficiencyEvidence: usage.proficiencyEvidence,
    })),
  };
}

export type TechnologyDetailDto = ReturnType<typeof toTechnologyDetailDto>;
