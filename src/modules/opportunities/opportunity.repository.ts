import type { Opportunity, Prisma, PrismaClient } from "@/generated/prisma/client";
import { escapeLike } from "@/lib/db/errors";
import { toSkipTake } from "@/lib/http/pagination";
import type { Tx } from "@/modules/shared/audit";
import { toDateOnly } from "@/modules/shared/fields";
import { provenanceInclude, toProvenance } from "@/modules/shared/provenance";

import type { ListOpportunitiesQuery } from "./opportunity.schemas";

type Db = PrismaClient | Tx;

const requirementInclude = {
  skill: { select: { id: true, name: true } },
  technology: { select: { id: true, name: true } },
  certification: { select: { id: true, name: true, issuer: true } },
  evidenceLinks: {
    include: {
      evidence: {
        select: {
          id: true,
          title: true,
          type: true,
          date: true,
          verified: true,
          githubResourceType: true,
        },
      },
    },
    orderBy: { evidence: { date: "desc" } },
  },
} satisfies Prisma.OpportunityRequirementInclude;

export const opportunityDetailInclude = {
  ...provenanceInclude,
  requirements: {
    include: requirementInclude,
    orderBy: [{ importance: "asc" }, { createdAt: "asc" }],
  },
} satisfies Prisma.OpportunityInclude;

type OpportunityDetailRecord = Prisma.OpportunityGetPayload<{
  include: typeof opportunityDetailInclude;
}>;
export type RequirementRecord = Prisma.OpportunityRequirementGetPayload<{
  include: typeof requirementInclude;
}>;

export const opportunityRepository = {
  findOwned(db: Db, userId: string, id: string) {
    return db.opportunity.findFirst({ where: { id, userId } });
  },

  findOwnedDetail(db: Db, userId: string, id: string) {
    return db.opportunity.findFirst({ where: { id, userId }, include: opportunityDetailInclude });
  },

  findOwnedRequirement(db: Db, userId: string, requirementId: string) {
    return db.opportunityRequirement.findFirst({ where: { id: requirementId, userId } });
  },

  async list(db: Db, userId: string, query: ListOpportunitiesQuery) {
    const and: Prisma.OpportunityWhereInput[] = [{ userId }];
    if (query.q) {
      const term = { contains: escapeLike(query.q), mode: "insensitive" as const };
      and.push({
        OR: [
          { title: term },
          { organization: term },
          { description: term },
          { source: term },
          { requirements: { some: { label: term } } },
        ],
      });
    }
    if (query.type) and.push({ type: query.type });
    if (query.status) and.push({ status: query.status });
    if (query.priority) and.push({ priority: query.priority });
    const where: Prisma.OpportunityWhereInput = { AND: and };

    const [rows, total] = await Promise.all([
      db.opportunity.findMany({
        where,
        orderBy: query.sort as Prisma.OpportunityOrderByWithRelationInput[],
        ...toSkipTake(query),
        include: { _count: { select: { requirements: true } } },
      }),
      db.opportunity.count({ where }),
    ]);
    return { rows, total };
  },
};

export function toOpportunityDto(o: Opportunity) {
  return {
    id: o.id,
    title: o.title,
    organization: o.organization,
    type: o.type,
    status: o.status,
    priority: o.priority,
    description: o.description,
    source: o.source,
    sourceUrl: o.sourceUrl,
    location: o.location,
    deadline: toDateOnly(o.deadline),
    nextAction: o.nextAction,
    notes: o.notes,
    origin: o.origin,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

export function toOpportunityListItem(o: Opportunity & { _count: { requirements: number } }) {
  return { ...toOpportunityDto(o), counts: { requirements: o._count.requirements } };
}

export type OpportunityListItem = ReturnType<typeof toOpportunityListItem>;

export function toRequirementDto(r: RequirementRecord) {
  return {
    id: r.id,
    kind: r.kind,
    label: r.label,
    description: r.description,
    importance: r.importance,
    skill: r.skill,
    technology: r.technology,
    certification: r.certification,
    evidence: r.evidenceLinks.map((link) => ({
      id: link.evidence.id,
      title: link.evidence.title,
      type: link.evidence.type,
      date: toDateOnly(link.evidence.date),
      verified: link.evidence.verified,
      github: link.evidence.githubResourceType !== null,
    })),
  };
}

export type RequirementDto = ReturnType<typeof toRequirementDto>;

export function toOpportunityDetailDto(o: OpportunityDetailRecord) {
  return {
    ...toOpportunityDto(o),
    provenance: toProvenance(o),
    requirements: o.requirements.map(toRequirementDto),
  };
}

export type OpportunityDetailDto = ReturnType<typeof toOpportunityDetailDto>;

/** Audit snapshot (no derived fields). */
export function opportunitySnapshot(o: Opportunity) {
  return toOpportunityDto(o);
}
