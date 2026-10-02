import type { Certification, Prisma, PrismaClient } from "@/generated/prisma/client";
import { escapeLike } from "@/lib/db/errors";
import { toSkipTake } from "@/lib/http/pagination";
import type { Tx } from "@/modules/shared/audit";
import { toDateOnly } from "@/modules/shared/fields";
import { provenanceInclude, toProvenance } from "@/modules/shared/provenance";

import {
  EXPIRING_WINDOW_DAYS,
  expiryStateOf,
  type ExpiryState,
  type ListCertificationsQuery,
} from "./certification.schemas";

type Db = PrismaClient | Tx;

export const certificationDetailInclude = {
  ...provenanceInclude,
  skills: {
    include: { skill: { select: { id: true, name: true, category: true } } },
    orderBy: { skill: { name: "asc" } },
  },
  evidence: {
    include: {
      evidence: { select: { id: true, title: true, type: true, date: true, verified: true } },
    },
    orderBy: { evidence: { title: "asc" } },
  },
} satisfies Prisma.CertificationInclude;

type CertificationDetailRecord = Prisma.CertificationGetPayload<{
  include: typeof certificationDetailInclude;
}>;

function startOfTodayUtc(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Translate a derived expiry state into a date-range filter. */
export function expiryWhere(
  state: ExpiryState,
  now: Date = new Date(),
): Prisma.CertificationWhereInput {
  const today = startOfTodayUtc(now);
  const horizon = new Date(today.getTime() + EXPIRING_WINDOW_DAYS * 86_400_000);
  switch (state) {
    case "no_expiry":
      return { expiryDate: null };
    case "expired":
      return { expiryDate: { lt: today } };
    case "expiring":
      return { expiryDate: { gte: today, lte: horizon } };
    case "valid":
      return { expiryDate: { gt: horizon } };
  }
}

export const certificationRepository = {
  findOwned(db: Db, userId: string, id: string) {
    return db.certification.findFirst({ where: { id, userId } });
  },

  findOwnedDetail(db: Db, userId: string, id: string) {
    return db.certification.findFirst({
      where: { id, userId },
      include: certificationDetailInclude,
    });
  },

  async list(db: Db, userId: string, query: ListCertificationsQuery) {
    const and: Prisma.CertificationWhereInput[] = [{ userId }];
    if (query.q) {
      const term = { contains: escapeLike(query.q), mode: "insensitive" as const };
      and.push({
        OR: [{ name: term }, { issuer: term }, { category: term }, { credentialId: term }],
      });
    }
    if (query.status) and.push({ status: query.status });
    if (query.issuer) {
      and.push({ issuer: { contains: escapeLike(query.issuer), mode: "insensitive" } });
    }
    if (query.expiry) and.push(expiryWhere(query.expiry));
    if (query.current !== undefined) {
      and.push(query.current ? { status: { not: "revoked" } } : { status: "revoked" });
    }
    const where: Prisma.CertificationWhereInput = { AND: and };

    const [rows, total] = await Promise.all([
      db.certification.findMany({
        where,
        orderBy: query.sort as Prisma.CertificationOrderByWithRelationInput[],
        ...toSkipTake(query),
        include: { _count: { select: { skills: true, evidence: true } } },
      }),
      db.certification.count({ where }),
    ]);
    return { rows, total };
  },
};

export function toCertificationDto(certification: Certification) {
  return {
    id: certification.id,
    name: certification.name,
    issuer: certification.issuer,
    category: certification.category,
    issueDate: toDateOnly(certification.issueDate),
    expiryDate: toDateOnly(certification.expiryDate),
    expiryState: expiryStateOf(certification.expiryDate),
    credentialId: certification.credentialId,
    verificationUrl: certification.verificationUrl,
    status: certification.status,
    origin: certification.origin,
    createdAt: certification.createdAt.toISOString(),
    updatedAt: certification.updatedAt.toISOString(),
  };
}

export function toCertificationListItem(
  certification: Certification & { _count: { skills: number; evidence: number } },
) {
  return { ...toCertificationDto(certification), counts: certification._count };
}

export type CertificationListItem = ReturnType<typeof toCertificationListItem>;

export function toCertificationDetailDto(certification: CertificationDetailRecord) {
  return {
    ...toCertificationDto(certification),
    provenance: toProvenance(certification),
    skills: certification.skills.map((link) => link.skill),
    evidence: certification.evidence.map((link) => ({
      ...link.evidence,
      date: toDateOnly(link.evidence.date),
    })),
  };
}

export type CertificationDetailDto = ReturnType<typeof toCertificationDetailDto>;

/** Audit snapshot without the derived (time-dependent) expiry state. */
export function certificationSnapshot(certification: Certification) {
  const { expiryState: _derived, ...rest } = toCertificationDto(certification);
  return rest;
}
