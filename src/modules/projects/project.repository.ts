import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { escapeLike } from "@/lib/db/errors";
import { toSkipTake } from "@/lib/http/pagination";
import type { Tx } from "@/modules/shared/audit";
import { provenanceInclude } from "@/modules/shared/provenance";

import { LIFECYCLE_GROUPS } from "./project.lifecycle";
import type { ListProjectsQuery } from "./project.schemas";

type Db = PrismaClient | Tx;

export const projectDetailInclude = {
  ...provenanceInclude,
  skills: {
    include: { skill: { select: { id: true, name: true, category: true, active: true } } },
    orderBy: { skill: { name: "asc" } },
  },
  technologies: {
    include: { technology: { select: { id: true, name: true, category: true, version: true } } },
    orderBy: { technology: { name: "asc" } },
  },
  evidence: {
    include: {
      evidence: { select: { id: true, title: true, type: true, date: true, verified: true } },
    },
    orderBy: { evidence: { title: "asc" } },
  },
} satisfies Prisma.ProjectInclude;

export type ProjectDetailRecord = Prisma.ProjectGetPayload<{
  include: typeof projectDetailInclude;
}>;

/** All queries are scoped by `userId`; there is no unscoped lookup (ADR 0003). */
export const projectRepository = {
  findOwned(db: Db, userId: string, id: string) {
    return db.project.findFirst({ where: { id, userId } });
  },

  findOwnedDetail(db: Db, userId: string, id: string) {
    return db.project.findFirst({ where: { id, userId }, include: projectDetailInclude });
  },

  slugTaken(db: Db, userId: string, slug: string, exceptId?: string) {
    return db.project
      .count({ where: { userId, slug, ...(exceptId ? { id: { not: exceptId } } : {}) } })
      .then((n) => n > 0);
  },

  async list(db: Db, userId: string, query: ListProjectsQuery) {
    const where: Prisma.ProjectWhereInput = { userId };
    if (query.q) {
      const term = { contains: escapeLike(query.q), mode: "insensitive" as const };
      where.OR = [
        { name: term },
        { slug: term },
        { description: term },
        { problem: term },
        { solution: term },
        { impact: term },
      ];
    }
    if (query.status) where.status = query.status;
    if (query.healthStatus) where.healthStatus = query.healthStatus;
    if (query.skillId) where.skills = { some: { skillId: query.skillId } };
    if (query.technologyId) where.technologies = { some: { technologyId: query.technologyId } };
    if (query.startFrom || query.startTo) {
      where.startDate = { gte: query.startFrom, lte: query.startTo };
    }
    if (query.imported !== undefined) where.origin = query.imported ? "import" : "manual";
    const and: Prisma.ProjectWhereInput[] = [];
    if (query.lifecycle) and.push({ status: { in: [...LIFECYCLE_GROUPS[query.lifecycle]] } });
    if (query.completedFrom || query.completedTo) {
      and.push({ completedAt: { gte: query.completedFrom, lte: query.completedTo } });
    }
    if (and.length) where.AND = and;

    const [rows, total] = await Promise.all([
      db.project.findMany({
        where,
        orderBy: query.sort as Prisma.ProjectOrderByWithRelationInput[],
        ...toSkipTake(query),
        include: { _count: { select: { skills: true, technologies: true, evidence: true } } },
      }),
      db.project.count({ where }),
    ]);
    return { rows, total };
  },
};
