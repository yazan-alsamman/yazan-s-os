import type {
  EvidenceCandidate,
  IntelligenceSignal,
  Prisma,
  PrismaClient,
  WeeklyReview,
} from "@/generated/prisma/client";
import { toSkipTake } from "@/lib/http/pagination";
import type { Tx } from "@/modules/shared/audit";
import { toDateOnly } from "@/modules/shared/fields";

import type { ListCandidatesQuery, ListSignalsQuery } from "./intelligence.schemas";

type Db = PrismaClient | Tx;

/** A detector's output: a condition to reconcile into a persisted signal (idempotent by dedupeKey). */
export interface SignalDraft {
  type: IntelligenceSignal["type"];
  severity: IntelligenceSignal["severity"];
  title: string;
  explanation: string;
  sourceType: string | null;
  sourceId: string | null;
  dedupeKey: string;
  occurredAt?: Date | null;
  metadata?: Prisma.InputJsonValue;
}

export const intelligenceRepository = {
  async listSignals(db: Db, userId: string, query: ListSignalsQuery) {
    const where: Prisma.IntelligenceSignalWhereInput = { userId };
    if (query.type) where.type = query.type;
    if (query.severity) where.severity = query.severity;
    where.status = query.status ?? { in: ["active", "reviewed"] };
    const [rows, total] = await Promise.all([
      db.intelligenceSignal.findMany({
        where,
        orderBy: query.sort as Prisma.IntelligenceSignalOrderByWithRelationInput[],
        ...toSkipTake(query),
      }),
      db.intelligenceSignal.count({ where }),
    ]);
    return { rows, total };
  },

  findOwnedSignal(db: Db, userId: string, id: string) {
    return db.intelligenceSignal.findFirst({ where: { id, userId } });
  },

  async listCandidates(db: Db, userId: string, query: ListCandidatesQuery) {
    const where: Prisma.EvidenceCandidateWhereInput = { userId };
    where.status = query.status ?? "candidate";
    const [rows, total] = await Promise.all([
      db.evidenceCandidate.findMany({
        where,
        orderBy: query.sort as Prisma.EvidenceCandidateOrderByWithRelationInput[],
        ...toSkipTake(query),
      }),
      db.evidenceCandidate.count({ where }),
    ]);
    return { rows, total };
  },

  findOwnedCandidate(db: Db, userId: string, id: string) {
    return db.evidenceCandidate.findFirst({ where: { id, userId } });
  },
};

export function toSignalDto(s: IntelligenceSignal) {
  return {
    id: s.id,
    type: s.type,
    severity: s.severity,
    status: s.status,
    title: s.title,
    explanation: s.explanation,
    sourceType: s.sourceType,
    sourceId: s.sourceId,
    metadata: s.metadata,
    detectedAt: s.detectedAt.toISOString(),
    occurredAt: s.occurredAt?.toISOString() ?? null,
    reviewedAt: s.reviewedAt?.toISOString() ?? null,
    dismissedAt: s.dismissedAt?.toISOString() ?? null,
    resolvedAt: s.resolvedAt?.toISOString() ?? null,
  };
}

export type SignalDto = ReturnType<typeof toSignalDto>;

export function toCandidateDto(c: EvidenceCandidate) {
  return {
    id: c.id,
    sourceType: c.sourceType,
    sourceId: c.sourceId,
    suggestedType: c.suggestedType,
    suggestedTitle: c.suggestedTitle,
    suggestedDate: toDateOnly(c.suggestedDate),
    sourceUrl: c.sourceUrl,
    repoFullName: c.repoFullName,
    confidence: c.confidence,
    method: c.method,
    status: c.status,
    acceptedEvidenceId: c.acceptedEvidenceId,
    github:
      c.githubResourceType !== null
        ? { resourceType: c.githubResourceType, resourceId: c.githubResourceId }
        : null,
    reviewedAt: c.reviewedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

export type CandidateDto = ReturnType<typeof toCandidateDto>;

export function toWeeklyReviewDto(w: WeeklyReview) {
  return {
    id: w.id,
    weekStart: toDateOnly(w.weekStart),
    weekEnd: toDateOnly(w.weekEnd),
    status: w.status,
    coverage: w.coverage,
    summary: w.summary,
    generatedAt: w.generatedAt.toISOString(),
    reviewedAt: w.reviewedAt?.toISOString() ?? null,
  };
}

export type WeeklyReviewDto = ReturnType<typeof toWeeklyReviewDto>;
