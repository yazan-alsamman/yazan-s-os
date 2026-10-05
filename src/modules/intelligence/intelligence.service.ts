import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors/app-error";
import { paginated } from "@/lib/http/pagination";
import { auditInTx, type Tx } from "@/modules/shared/audit";
import { requireFound } from "@/modules/shared/ownership-checks";
import type { ServiceContext } from "@/modules/shared/service-context";

import { detectOpportunitySignals, detectSkillSignals } from "./detectors";
import { extractCandidates } from "./evidence-extraction";
import {
  intelligenceRepository as repo,
  toCandidateDto,
  toSignalDto,
  toWeeklyReviewDto,
  type SignalDraft,
} from "./intelligence.repository";
import type {
  AcceptCandidateInput,
  ListCandidatesQuery,
  ListSignalsQuery,
  UpdateSignalInput,
} from "./intelligence.schemas";
import { generateLearningPlan } from "./learning-plan";
import { generateRetrospective } from "./retrospective";
import { generateWeeklyReview } from "./weekly-review";

/** Detector-owned signal types — the orchestrator auto-resolves these when their condition clears. */
const DETECTOR_TYPES = [
  "skill_stale",
  "skill_aging",
  "opportunity_gap",
  "opportunity_deadline",
] as const;

export function createIntelligenceService(db: PrismaClient, deps: { now?: () => Date } = {}) {
  const now = deps.now ?? (() => new Date());

  /** Reconcile detector drafts into persisted signals idempotently (never duplicates). */
  async function reconcile(tx: Tx, userId: string, drafts: SignalDraft[], at: Date) {
    let created = 0;
    let updated = 0;
    for (const d of drafts) {
      const existing = await tx.intelligenceSignal.findUnique({
        where: { userId_dedupeKey: { userId, dedupeKey: d.dedupeKey } },
      });
      if (!existing) {
        await tx.intelligenceSignal.create({
          data: {
            userId,
            type: d.type,
            severity: d.severity,
            title: d.title,
            explanation: d.explanation,
            sourceType: d.sourceType,
            sourceId: d.sourceId,
            dedupeKey: d.dedupeKey,
            occurredAt: d.occurredAt ?? null,
            metadata: d.metadata,
            detectedAt: at,
          },
        });
        created++;
        continue;
      }
      // Respect an owner's dismissal: a dismissed signal stays dismissed until it resolves + recurs.
      if (existing.status === "dismissed") continue;
      await tx.intelligenceSignal.update({
        where: { id: existing.id },
        data: {
          severity: d.severity,
          title: d.title,
          explanation: d.explanation,
          metadata: d.metadata,
          occurredAt: d.occurredAt ?? null,
          detectedAt: at,
          // A previously resolved condition that recurs becomes active again.
          status: existing.status === "resolved" ? "active" : existing.status,
          resolvedAt: existing.status === "resolved" ? null : existing.resolvedAt,
        },
      });
      updated++;
    }
    // Auto-resolve detector signals whose condition no longer holds (dismissed ones are left alone).
    const liveKeys = drafts.map((d) => d.dedupeKey);
    const resolved = await tx.intelligenceSignal.updateMany({
      where: {
        userId,
        type: { in: [...DETECTOR_TYPES] },
        status: { in: ["active", "reviewed"] },
        dedupeKey: { notIn: liveKeys },
      },
      data: { status: "resolved", resolvedAt: at },
    });
    return { created, updated, resolved: resolved.count };
  }

  return {
    /** The detection run: deterministic detectors → reconciled signals + extracted candidates. */
    async run(ctx: ServiceContext) {
      const at = now();
      const [skillDrafts, oppDrafts] = await Promise.all([
        detectSkillSignals(db, ctx.userId, at),
        detectOpportunitySignals(db, ctx.userId, at),
      ]);
      const drafts = [...skillDrafts, ...oppDrafts];

      const signalResult = await db.$transaction(async (tx) => {
        const r = await reconcile(tx, ctx.userId, drafts, at);
        return r;
      });
      // Candidate extraction is idempotent and its own unit of work (createMany skipDuplicates).
      const extraction = await extractCandidates(db, ctx.userId);

      await db.$transaction((tx) =>
        auditInTx(tx, ctx, {
          entity: "intelligence_signal",
          verb: "generated",
          entityId: ctx.userId,
          after: { ...signalResult, candidatesCreated: extraction.created },
        }),
      );

      return {
        ranAt: at.toISOString(),
        detectors: { skill: skillDrafts.length, opportunity: oppDrafts.length },
        signals: signalResult,
        candidates: extraction,
      };
    },

    async listSignals(ctx: ServiceContext, query: ListSignalsQuery) {
      const { rows, total } = await repo.listSignals(db, ctx.userId, query);
      return paginated(rows.map(toSignalDto), total, query);
    },

    async updateSignalStatus(ctx: ServiceContext, id: string, input: UpdateSignalInput) {
      return db.$transaction(async (tx) => {
        const existing = requireFound(await repo.findOwnedSignal(tx, ctx.userId, id));
        const at = now();
        const updated = await tx.intelligenceSignal.update({
          where: { id: existing.id },
          data: {
            status: input.status,
            reviewedAt: input.status === "reviewed" ? at : existing.reviewedAt,
            dismissedAt: input.status === "dismissed" ? at : null,
          },
        });
        await auditInTx(tx, ctx, {
          entity: "intelligence_signal",
          verb:
            input.status === "dismissed"
              ? "dismissed"
              : input.status === "reviewed"
                ? "reviewed"
                : "updated",
          entityId: id,
          before: { status: existing.status },
          after: { status: updated.status },
        });
        return toSignalDto(updated);
      });
    },

    async listCandidates(ctx: ServiceContext, query: ListCandidatesQuery) {
      const { rows, total } = await repo.listCandidates(db, ctx.userId, query);
      return paginated(rows.map(toCandidateDto), total, query);
    },

    /** Accept a candidate → create authoritative (but unverified) Evidence and link it. */
    async acceptCandidate(ctx: ServiceContext, id: string, input: AcceptCandidateInput) {
      return db.$transaction(async (tx) => {
        const c = requireFound(await repo.findOwnedCandidate(tx, ctx.userId, id));
        if (c.status !== "candidate") {
          throw new AppError("CONFLICT", { message: "This candidate has already been reviewed." });
        }
        const evidence = await tx.evidence.create({
          data: {
            userId: ctx.userId,
            type: c.suggestedType,
            title: input?.title ?? c.suggestedTitle,
            sourceUrl: c.sourceUrl,
            date: c.suggestedDate,
            verified: false, // extracted evidence starts unverified, pending the owner's verification
            origin: "manual",
            githubResourceType: c.githubResourceType,
            githubResourceId: c.githubResourceId,
          },
        });
        await tx.evidenceCandidate.update({
          where: { id: c.id },
          data: { status: "accepted", acceptedEvidenceId: evidence.id, reviewedAt: now() },
        });
        await auditInTx(tx, ctx, {
          entity: "evidence_candidate",
          verb: "accepted",
          entityId: c.id,
          after: { evidenceId: evidence.id, sourceType: c.sourceType, sourceId: c.sourceId },
        });
        return { candidateId: c.id, evidenceId: evidence.id };
      });
    },

    async rejectCandidate(ctx: ServiceContext, id: string) {
      return db.$transaction(async (tx) => {
        const c = requireFound(await repo.findOwnedCandidate(tx, ctx.userId, id));
        if (c.status !== "candidate") {
          throw new AppError("CONFLICT", { message: "This candidate has already been reviewed." });
        }
        await tx.evidenceCandidate.update({
          where: { id: c.id },
          data: { status: "rejected", reviewedAt: now() },
        });
        await auditInTx(tx, ctx, {
          entity: "evidence_candidate",
          verb: "rejected",
          entityId: c.id,
        });
      });
    },

    /** Idempotent weekly review: generate-or-update the row for the requested (or current) week. */
    async weeklyReview(ctx: ServiceContext, week?: string) {
      const weekDate = week ? new Date(`${week}T00:00:00.000Z`) : undefined;
      const result = await generateWeeklyReview(db, ctx.userId, now(), weekDate);
      const row = await db.$transaction(async (tx) => {
        const saved = await tx.weeklyReview.upsert({
          where: { userId_weekStart: { userId: ctx.userId, weekStart: result.weekStart } },
          create: {
            userId: ctx.userId,
            weekStart: result.weekStart,
            weekEnd: result.weekEnd,
            status: result.status,
            coverage: result.coverage as never,
            summary: result.summary as never,
          },
          update: {
            weekEnd: result.weekEnd,
            status: result.status,
            coverage: result.coverage as never,
            summary: result.summary as never,
            generatedAt: now(),
          },
        });
        await auditInTx(tx, ctx, {
          entity: "weekly_review",
          verb: "generated",
          entityId: saved.id,
          after: { weekStart: result.weekStart.toISOString().slice(0, 10), status: result.status },
        });
        return saved;
      });
      return toWeeklyReviewDto(row);
    },

    retrospective(ctx: ServiceContext, projectId: string) {
      return generateRetrospective(db, ctx.userId, projectId, now());
    },

    learningPlan(ctx: ServiceContext) {
      return generateLearningPlan(db, ctx.userId, now());
    },
  };
}

export type IntelligenceService = ReturnType<typeof createIntelligenceService>;
