import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { EvidenceType, RecordOrigin } from "@/generated/prisma/enums";
import { paginated, toSkipTake } from "@/lib/http/pagination";
import { toDateOnly } from "@/modules/shared/fields";
import type { ServiceContext } from "@/modules/shared/service-context";

import type { RangePreset } from "./dashboard.schemas";
import { dateWhere, resolvePeriod, toPeriodDto } from "./period";

/**
 * Evidence timeline (ADR 0021). Uses the evidence date you recorded — never createdAt, never a
 * fabricated date. Undated evidence is excluded from the timeline and reported as a count with a
 * link to fix it. Bounded: page size ≤ 50; at most RELATED_LIMIT related records per kind.
 */
export const RELATED_LIMIT = 3;

export interface TimelineQuery {
  range: RangePreset;
  from?: Date;
  to?: Date;
  evidenceType?: EvidenceType;
  evidenceVerified?: boolean;
  evidenceOrigin?: RecordOrigin;
  page: number;
  pageSize: number;
}

export function createTimelineService(db: PrismaClient) {
  return {
    async list(ctx: ServiceContext, query: TimelineQuery, now: Date = new Date()) {
      const period = resolvePeriod(query, now);
      const base: Prisma.EvidenceWhereInput = { userId: ctx.userId };
      if (query.evidenceType) base.type = query.evidenceType;
      if (query.evidenceVerified !== undefined) base.verified = query.evidenceVerified;
      if (query.evidenceOrigin) base.origin = query.evidenceOrigin;
      const where: Prisma.EvidenceWhereInput = {
        ...base,
        date: dateWhere(period) ?? { not: null },
      };

      const [rows, total, undated] = await Promise.all([
        db.evidence.findMany({
          where,
          orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "asc" }],
          ...toSkipTake(query),
          select: {
            id: true,
            title: true,
            type: true,
            date: true,
            verified: true,
            origin: true,
            _count: {
              select: { projects: true, skills: true, certifications: true, experiences: true },
            },
            projects: {
              take: RELATED_LIMIT,
              orderBy: { project: { name: "asc" } },
              select: { project: { select: { id: true, name: true } } },
            },
            skills: {
              take: RELATED_LIMIT,
              orderBy: { skill: { name: "asc" } },
              select: { skill: { select: { id: true, name: true } } },
            },
            certifications: {
              take: RELATED_LIMIT,
              orderBy: { certification: { name: "asc" } },
              select: { certification: { select: { id: true, name: true } } },
            },
            experiences: {
              take: RELATED_LIMIT,
              orderBy: { experience: { startDate: "desc" } },
              select: { experience: { select: { id: true, title: true, organization: true } } },
            },
          },
        }),
        db.evidence.count({ where }),
        db.evidence.count({ where: { ...base, date: null } }),
      ]);

      const data = rows.map((e) => ({
        id: e.id,
        title: e.title,
        type: e.type,
        date: toDateOnly(e.date)!,
        verified: e.verified,
        origin: e.origin,
        counts: e._count,
        related: [
          ...e.projects.map(({ project }) => ({
            kind: "project" as const,
            id: project.id,
            label: project.name,
            href: `/projects/${project.id}`,
          })),
          ...e.skills.map(({ skill }) => ({
            kind: "skill" as const,
            id: skill.id,
            label: skill.name,
            href: `/skills/${skill.id}`,
          })),
          ...e.certifications.map(({ certification }) => ({
            kind: "certification" as const,
            id: certification.id,
            label: certification.name,
            href: `/certifications/${certification.id}`,
          })),
          ...e.experiences.map(({ experience }) => ({
            kind: "experience" as const,
            id: experience.id,
            label: `${experience.title} · ${experience.organization}`,
            href: `/career/experience/${experience.id}`,
          })),
        ],
      }));
      return {
        ...paginated(data, total, query),
        undatedCount: undated,
        period: toPeriodDto(period),
      };
    },
  };
}
