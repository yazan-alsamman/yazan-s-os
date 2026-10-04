import type { Evidence, Prisma, PrismaClient } from "@/generated/prisma/client";
import { escapeLike } from "@/lib/db/errors";
import { toSkipTake } from "@/lib/http/pagination";
import type { Tx } from "@/modules/shared/audit";
import { toDateOnly } from "@/modules/shared/fields";
import { provenanceInclude, toProvenance } from "@/modules/shared/provenance";

import type { ListEvidenceQuery } from "./evidence.schemas";

type Db = PrismaClient | Tx;

/** Evidence detail exposes every entity it is linked to (01 §10). */
export const evidenceDetailInclude = {
  ...provenanceInclude,
  projects: {
    include: { project: { select: { id: true, name: true, status: true } } },
    orderBy: { project: { name: "asc" } },
  },
  skills: {
    include: { skill: { select: { id: true, name: true } } },
    orderBy: { skill: { name: "asc" } },
  },
  certifications: {
    include: { certification: { select: { id: true, name: true, issuer: true } } },
    orderBy: { certification: { name: "asc" } },
  },
  experiences: {
    include: { experience: { select: { id: true, title: true, organization: true } } },
    orderBy: { experience: { startDate: "desc" } },
  },
  requirementLinks: {
    include: {
      requirement: {
        select: {
          id: true,
          label: true,
          importance: true,
          opportunity: { select: { id: true, title: true } },
        },
      },
    },
  },
} satisfies Prisma.EvidenceInclude;

type EvidenceDetailRecord = Prisma.EvidenceGetPayload<{ include: typeof evidenceDetailInclude }>;

export const evidenceRepository = {
  findOwned(db: Db, userId: string, id: string) {
    return db.evidence.findFirst({ where: { id, userId } });
  },

  findOwnedDetail(db: Db, userId: string, id: string) {
    return db.evidence.findFirst({ where: { id, userId }, include: evidenceDetailInclude });
  },

  async list(db: Db, userId: string, query: ListEvidenceQuery) {
    const where: Prisma.EvidenceWhereInput = { userId };
    if (query.q) {
      const term = { contains: escapeLike(query.q), mode: "insensitive" as const };
      where.OR = [{ title: term }, { description: term }, { sourceUrl: term }];
    }
    if (query.type) where.type = query.type;
    if (query.verified !== undefined) where.verified = query.verified;
    if (query.origin) where.origin = query.origin;
    if (query.dateFrom || query.dateTo) where.date = { gte: query.dateFrom, lte: query.dateTo };
    const and: Prisma.EvidenceWhereInput[] = [];
    if (query.dated !== undefined) and.push({ date: query.dated ? { not: null } : null });
    if (query.projectId) and.push({ projects: { some: { projectId: query.projectId } } });
    if (query.skillId) and.push({ skills: { some: { skillId: query.skillId } } });
    if (and.length) where.AND = and;

    const [rows, total] = await Promise.all([
      db.evidence.findMany({
        where,
        orderBy: query.sort as Prisma.EvidenceOrderByWithRelationInput[],
        ...toSkipTake(query),
        include: {
          _count: {
            select: { projects: true, skills: true, certifications: true, experiences: true },
          },
        },
      }),
      db.evidence.count({ where }),
    ]);
    return { rows, total };
  },
};

export function toEvidenceDto(evidence: Evidence) {
  return {
    id: evidence.id,
    type: evidence.type,
    title: evidence.title,
    description: evidence.description,
    sourceUrl: evidence.sourceUrl,
    fileUrl: evidence.fileUrl,
    date: toDateOnly(evidence.date),
    verified: evidence.verified,
    verifiedAt: evidence.verifiedAt?.toISOString() ?? null,
    origin: evidence.origin,
    github:
      evidence.githubResourceType !== null
        ? { resourceType: evidence.githubResourceType, resourceId: evidence.githubResourceId }
        : null,
    createdAt: evidence.createdAt.toISOString(),
    updatedAt: evidence.updatedAt.toISOString(),
  };
}

export function toEvidenceListItem(
  evidence: Evidence & {
    _count: { projects: number; skills: number; certifications: number; experiences: number };
  },
) {
  return { ...toEvidenceDto(evidence), counts: evidence._count };
}

export type EvidenceListItem = ReturnType<typeof toEvidenceListItem>;

export function toEvidenceDetailDto(evidence: EvidenceDetailRecord) {
  return {
    ...toEvidenceDto(evidence),
    provenance: toProvenance(evidence),
    projects: evidence.projects.map((link) => link.project),
    skills: evidence.skills.map((link) => ({
      ...link.skill,
      strength: link.strength,
      linkDate: toDateOnly(link.date),
    })),
    certifications: evidence.certifications.map((link) => link.certification),
    experiences: evidence.experiences.map((link) => link.experience),
    requirements: evidence.requirementLinks.map((link) => ({
      requirementId: link.requirement.id,
      label: link.requirement.label,
      importance: link.requirement.importance,
      opportunityId: link.requirement.opportunity.id,
      opportunityTitle: link.requirement.opportunity.title,
    })),
  };
}

export type EvidenceDetailDto = ReturnType<typeof toEvidenceDetailDto>;
