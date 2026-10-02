import type { Experience, Prisma, PrismaClient } from "@/generated/prisma/client";
import { escapeLike } from "@/lib/db/errors";
import { toSkipTake } from "@/lib/http/pagination";
import type { Tx } from "@/modules/shared/audit";
import { toDateOnly } from "@/modules/shared/fields";
import { provenanceInclude, toProvenance } from "@/modules/shared/provenance";

import type { ListExperiencesQuery } from "./experience.schemas";

type Db = PrismaClient | Tx;

export const experienceDetailInclude = {
  ...provenanceInclude,
  evidence: {
    include: {
      evidence: { select: { id: true, title: true, type: true, date: true, verified: true } },
    },
    orderBy: { evidence: { title: "asc" } },
  },
} satisfies Prisma.ExperienceInclude;

type ExperienceDetailRecord = Prisma.ExperienceGetPayload<{
  include: typeof experienceDetailInclude;
}>;

export const experienceRepository = {
  findOwned(db: Db, userId: string, id: string) {
    return db.experience.findFirst({ where: { id, userId } });
  },

  findOwnedDetail(db: Db, userId: string, id: string) {
    return db.experience.findFirst({ where: { id, userId }, include: experienceDetailInclude });
  },

  async list(db: Db, userId: string, query: ListExperiencesQuery) {
    const where: Prisma.ExperienceWhereInput = { userId };
    if (query.q) {
      const term = { contains: escapeLike(query.q), mode: "insensitive" as const };
      where.OR = [{ organization: term }, { title: term }, { description: term }];
    }
    if (query.current !== undefined) where.endDate = query.current ? null : { not: null };
    const [rows, total] = await Promise.all([
      db.experience.findMany({
        where,
        orderBy: query.sort as Prisma.ExperienceOrderByWithRelationInput[],
        ...toSkipTake(query),
        include: { _count: { select: { evidence: true } } },
      }),
      db.experience.count({ where }),
    ]);
    return { rows, total };
  },
};

export function toExperienceDto(experience: Experience) {
  return {
    id: experience.id,
    organization: experience.organization,
    title: experience.title,
    startDate: toDateOnly(experience.startDate),
    endDate: toDateOnly(experience.endDate),
    current: experience.endDate === null,
    description: experience.description,
    achievements: experience.achievements,
    origin: experience.origin,
    createdAt: experience.createdAt.toISOString(),
    updatedAt: experience.updatedAt.toISOString(),
  };
}

export function toExperienceListItem(experience: Experience & { _count: { evidence: number } }) {
  return { ...toExperienceDto(experience), counts: experience._count };
}

export type ExperienceListItem = ReturnType<typeof toExperienceListItem>;

export function toExperienceDetailDto(experience: ExperienceDetailRecord) {
  return {
    ...toExperienceDto(experience),
    provenance: toProvenance(experience),
    evidence: experience.evidence.map((link) => ({
      ...link.evidence,
      date: toDateOnly(link.evidence.date),
    })),
  };
}

export type ExperienceDetailDto = ReturnType<typeof toExperienceDetailDto>;
