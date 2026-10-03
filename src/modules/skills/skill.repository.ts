import type { Prisma, PrismaClient, Skill } from "@/generated/prisma/client";
import { escapeLike } from "@/lib/db/errors";
import { toSkipTake } from "@/lib/http/pagination";
import type { Tx } from "@/modules/shared/audit";
import { toDateOnly } from "@/modules/shared/fields";
import { provenanceInclude, toProvenance } from "@/modules/shared/provenance";

import { levelLabel } from "./level-models";
import type { ListSkillsQuery } from "./skill.schemas";

type Db = PrismaClient | Tx;

export const skillDetailInclude = {
  ...provenanceInclude,
  projects: {
    include: { project: { select: { id: true, name: true, status: true } } },
    orderBy: { project: { name: "asc" } },
  },
  evidence: {
    include: {
      evidence: { select: { id: true, title: true, type: true, date: true, verified: true } },
    },
    orderBy: { evidence: { title: "asc" } },
  },
  certifications: {
    include: { certification: { select: { id: true, name: true, issuer: true, status: true } } },
    orderBy: { certification: { name: "asc" } },
  },
  technologies: {
    include: { technology: { select: { id: true, name: true, version: true, category: true } } },
    orderBy: { technology: { name: "asc" } },
  },
} satisfies Prisma.SkillInclude;

type SkillDetailRecord = Prisma.SkillGetPayload<{ include: typeof skillDetailInclude }>;

export const skillRepository = {
  findOwned(db: Db, userId: string, id: string) {
    return db.skill.findFirst({ where: { id, userId } });
  },

  findOwnedDetail(db: Db, userId: string, id: string) {
    return db.skill.findFirst({ where: { id, userId }, include: skillDetailInclude });
  },

  keyTaken(db: Db, userId: string, key: string, exceptId?: string) {
    return db.skill
      .count({ where: { userId, key, ...(exceptId ? { id: { not: exceptId } } : {}) } })
      .then((n) => n > 0);
  },

  async list(db: Db, userId: string, query: ListSkillsQuery) {
    const where: Prisma.SkillWhereInput = { userId };
    if (query.q) {
      const term = { contains: escapeLike(query.q), mode: "insensitive" as const };
      where.OR = [{ name: term }, { category: term }, { description: term }];
    }
    if (query.category) where.category = { equals: query.category, mode: "insensitive" };
    if (query.active !== undefined) where.active = query.active;
    if (query.hasEvidence !== undefined) {
      where.evidence = query.hasEvidence ? { some: {} } : { none: {} };
    }
    if (query.hasTarget !== undefined) {
      where.targetLevel = query.hasTarget ? { not: null } : null;
    }
    const [rows, total] = await Promise.all([
      db.skill.findMany({
        where,
        orderBy: query.sort as Prisma.SkillOrderByWithRelationInput[],
        ...toSkipTake(query),
        include: { _count: { select: { projects: true, evidence: true, certifications: true } } },
      }),
      db.skill.count({ where }),
    ]);
    return { rows, total };
  },

  /** Distinct categories in use, for filter options. */
  async categories(db: Db, userId: string) {
    const rows = await db.skill.findMany({
      where: { userId, category: { not: null } },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
      take: 200,
    });
    return rows.map((r) => r.category).filter((c): c is string => Boolean(c));
  },
};

export function toSkillDto(skill: Skill) {
  return {
    id: skill.id,
    name: skill.name,
    category: skill.category,
    description: skill.description,
    levelModel: skill.levelModel,
    levelModelId: skill.levelModelId,
    targetLevel: skill.targetLevel,
    targetLevelLabel: levelLabel(skill.levelModel, skill.targetLevel),
    active: skill.active,
    origin: skill.origin,
    createdAt: skill.createdAt.toISOString(),
    updatedAt: skill.updatedAt.toISOString(),
  };
}

export type SkillDto = ReturnType<typeof toSkillDto>;

export function toSkillListItem(
  skill: Skill & { _count: { projects: number; evidence: number; certifications: number } },
) {
  return { ...toSkillDto(skill), counts: skill._count };
}

export type SkillListItem = ReturnType<typeof toSkillListItem>;

export function toSkillDetailDto(skill: SkillDetailRecord) {
  return {
    ...toSkillDto(skill),
    provenance: toProvenance(skill),
    projects: skill.projects.map((link) => link.project),
    evidence: skill.evidence.map((link) => ({
      ...link.evidence,
      date: toDateOnly(link.evidence.date),
      strength: link.strength,
      linkDate: toDateOnly(link.date),
    })),
    certifications: skill.certifications.map((link) => link.certification),
    technologies: skill.technologies.map((link) => link.technology),
  };
}

export type SkillDetailDto = ReturnType<typeof toSkillDetailDto>;
