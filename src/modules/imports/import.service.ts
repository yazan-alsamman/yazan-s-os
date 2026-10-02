import { createHash } from "node:crypto";

import type { ImportRecord, Prisma, PrismaClient } from "@/generated/prisma/client";
import type { ImportEntityType, ImportSource } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors/app-error";
import { paginated, toSkipTake } from "@/lib/http/pagination";
import { auditInTx, type Tx } from "@/modules/shared/audit";
import { requireFound } from "@/modules/shared/ownership-checks";
import type { ServiceContext } from "@/modules/shared/service-context";

import {
  ACCEPT_ORDER,
  candidateLabel,
  validateCandidate,
  type CandidatePayload,
} from "./candidates";
import { loadExistingSnapshots, diffAgainst } from "./existing";
import type { DecisionInput, ListImportRecordsQuery } from "./import.schemas";
import { buildMatcher } from "./matching";
import { confidenceFor, ImportFormatError, parseImportFile } from "./parsers";
import { persistCandidate } from "./persist";

export interface UploadedFile {
  name: string;
  bytes: Uint8Array;
}

function decodeText(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new AppError("VALIDATION_FAILED", { message: "The file must be UTF-8 text." });
  }
  if (text.includes("\u0000")) {
    throw new AppError("VALIDATION_FAILED", { message: "The file contains binary data." });
  }
  return text;
}

function toJobDto(job: {
  id: string;
  source: ImportSource;
  fileName: string;
  fileSize: number;
  fileSha256: string;
  parserVersion: string;
  status: string;
  entityHint: ImportEntityType | null;
  recordCount: number;
  invalidCount: number;
  createdAt: Date;
  completedAt: Date | null;
}) {
  return {
    id: job.id,
    source: job.source,
    fileName: job.fileName,
    fileSize: job.fileSize,
    fileSha256: job.fileSha256,
    parserVersion: job.parserVersion,
    status: job.status,
    entityHint: job.entityHint,
    recordCount: job.recordCount,
    invalidCount: job.invalidCount,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

function toRecordDto(record: ImportRecord) {
  return {
    id: record.id,
    entityType: record.entityType,
    sourceRef: record.sourceRef,
    label: candidateLabel(record.entityType, record.payload as CandidatePayload),
    payload: record.payload as CandidatePayload,
    validationStatus: record.validationStatus,
    validationErrors: (record.validationErrors as { path: string; message: string }[] | null) ?? [],
    confidence: record.confidence,
    match: record.match,
    matchedEntityId: record.matchedEntityId,
    reviewStatus: record.reviewStatus,
    decision: record.decision,
    resultEntityId: record.resultEntityId,
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    notes: record.errorMessage,
  };
}

/**
 * Import pipeline (11_DATA_IMPORT_PROFILE.md, ADR 0014):
 * upload → parse → normalise → validate → duplicate-match → review queue → accept/reject → persist.
 * Nothing becomes authoritative without an explicit review decision.
 */
export function createImportService(db: PrismaClient) {
  async function refreshJobStatus(tx: Tx, userId: string, jobId: string) {
    const pending = await tx.importRecord.count({
      where: { userId, jobId, reviewStatus: "pending" },
    });
    await tx.importJob.update({
      where: { id: jobId },
      data:
        pending === 0
          ? { status: "completed", completedAt: new Date() }
          : { status: "pending_review", completedAt: null },
    });
  }

  /** Decide one record inside an existing transaction. */
  async function decideInTx(
    tx: Tx,
    ctx: ServiceContext,
    record: ImportRecord,
    input: DecisionInput,
  ) {
    if (record.reviewStatus !== "pending") {
      throw new AppError("CONFLICT", { message: "This record has already been reviewed." });
    }
    const reviewed = { reviewedAt: new Date(), reviewedById: ctx.userId };

    if (input.action === "reject") {
      const updated = await tx.importRecord.update({
        where: { id: record.id },
        data: { reviewStatus: "rejected", ...reviewed },
      });
      await auditInTx(tx, ctx, {
        entity: "import_record",
        verb: "rejected",
        entityId: record.id,
        after: { jobId: record.jobId, entityType: record.entityType },
      });
      return updated;
    }

    const validation = validateCandidate(record.entityType, record.payload as CandidatePayload);
    if (!validation.valid) {
      throw new AppError("VALIDATION_FAILED", {
        message: "Invalid records cannot be accepted.",
        details: validation.issues,
      });
    }
    // Re-match at decision time: the user's data may have changed since upload.
    const match = await buildMatcher(tx, ctx.userId, new Set([record.entityType]));
    const matchedId = match(record.entityType, validation.entity);
    const mode = input.mode ?? (matchedId ? null : "create");
    if (!mode) {
      throw new AppError("CONFLICT", {
        message:
          "This record matches an existing one. Choose to update it or to create a new record.",
      });
    }
    const result = await persistCandidate(record.entityType, mode, {
      tx,
      ctx,
      importRecordId: record.id,
      entity: validation.entity,
      relations: validation.relations,
      targetId: matchedId,
    });
    const updated = await tx.importRecord.update({
      where: { id: record.id },
      data: {
        reviewStatus: "accepted",
        decision: mode,
        resultEntityId: result.entityId,
        match: matchedId ? "duplicate" : "new",
        matchedEntityId: matchedId,
        errorMessage: result.notes.length ? result.notes.join("\n") : null,
        ...reviewed,
      },
    });
    await auditInTx(tx, ctx, {
      entity: "import_record",
      verb: "accepted",
      entityId: record.id,
      after: {
        jobId: record.jobId,
        entityType: record.entityType,
        decision: mode,
        resultEntityId: result.entityId,
      },
    });
    return updated;
  }

  return {
    async upload(
      ctx: ServiceContext,
      source: ImportSource,
      entityType: ImportEntityType | null,
      file: UploadedFile,
    ) {
      const text = decodeText(file.bytes);
      let parsed;
      try {
        parsed = parseImportFile(source, text, entityType);
      } catch (error) {
        if (error instanceof ImportFormatError) {
          throw new AppError("VALIDATION_FAILED", { message: error.message });
        }
        throw error;
      }
      const confidence = confidenceFor(source);
      const fileSha256 = createHash("sha256").update(file.bytes).digest("hex");

      return db.$transaction(
        async (tx) => {
          const types = new Set(parsed.candidates.map((c) => c.entityType));
          const match = await buildMatcher(tx, ctx.userId, types);
          const rows = parsed.candidates.map((candidate) => {
            const validation = validateCandidate(candidate.entityType, candidate.payload);
            const matchedId = validation.valid
              ? match(candidate.entityType, validation.entity)
              : null;
            return {
              userId: ctx.userId,
              entityType: candidate.entityType,
              sourceRef: candidate.sourceRef,
              payload: candidate.payload as Prisma.InputJsonValue,
              validationStatus: validation.valid ? ("valid" as const) : ("invalid" as const),
              validationErrors: validation.valid
                ? undefined
                : (validation.issues as unknown as Prisma.InputJsonValue),
              confidence,
              match: matchedId ? ("duplicate" as const) : ("new" as const),
              matchedEntityId: matchedId,
            };
          });
          const invalidCount = rows.filter((r) => r.validationStatus === "invalid").length;
          const job = await tx.importJob.create({
            data: {
              userId: ctx.userId,
              source,
              fileName: file.name.slice(0, 255),
              fileSize: file.bytes.byteLength,
              fileSha256,
              parserVersion: parsed.parserVersion,
              entityHint: parsed.entityHint,
              recordCount: rows.length,
              invalidCount,
            },
          });
          await tx.importRecord.createMany({
            data: rows.map((row) => ({ ...row, jobId: job.id })),
          });
          await auditInTx(tx, ctx, {
            entity: "import_job",
            verb: "uploaded",
            entityId: job.id,
            after: {
              source,
              fileName: job.fileName,
              fileSha256,
              recordCount: rows.length,
              invalidCount,
            },
          });
          return toJobDto(job);
        },
        { timeout: 30_000 },
      );
    },

    async listJobs(ctx: ServiceContext, query: { page: number; pageSize: number }) {
      const where = { userId: ctx.userId };
      const [jobs, total] = await Promise.all([
        db.importJob.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          ...toSkipTake(query),
        }),
        db.importJob.count({ where }),
      ]);
      const counts = await db.importRecord.groupBy({
        by: ["jobId", "reviewStatus"],
        where: { userId: ctx.userId, jobId: { in: jobs.map((j) => j.id) } },
        _count: { _all: true },
      });
      const data = jobs.map((job) => {
        const byStatus = Object.fromEntries(
          counts.filter((c) => c.jobId === job.id).map((c) => [c.reviewStatus, c._count._all]),
        );
        return {
          ...toJobDto(job),
          pending: byStatus.pending ?? 0,
          accepted: byStatus.accepted ?? 0,
          rejected: byStatus.rejected ?? 0,
        };
      });
      return paginated(data, total, query);
    },

    /** Job + one page of records; duplicates carry a field-level diff against the existing record. */
    async getJob(ctx: ServiceContext, jobId: string, query: ListImportRecordsQuery) {
      const job = requireFound(
        await db.importJob.findFirst({ where: { id: jobId, userId: ctx.userId } }),
      );
      const where: Prisma.ImportRecordWhereInput = { userId: ctx.userId, jobId };
      if (query.reviewStatus) where.reviewStatus = query.reviewStatus;
      if (query.validationStatus) where.validationStatus = query.validationStatus;
      if (query.entityType) where.entityType = query.entityType;
      const [records, total, pending] = await Promise.all([
        db.importRecord.findMany({
          where,
          orderBy: [{ createdAt: "asc" }, { sourceRef: "asc" }, { id: "asc" }],
          ...toSkipTake(query),
        }),
        db.importRecord.count({ where }),
        db.importRecord.count({ where: { userId: ctx.userId, jobId, reviewStatus: "pending" } }),
      ]);
      const existing = await loadExistingSnapshots(
        db,
        ctx.userId,
        records.filter((r) => r.matchedEntityId && r.reviewStatus === "pending"),
      );
      const data = records.map((record) => {
        const dto = toRecordDto(record);
        const snapshot = record.matchedEntityId ? existing.get(record.matchedEntityId) : undefined;
        if (!snapshot || record.reviewStatus !== "pending") return { ...dto, comparison: null };
        const differences = diffAgainst(record.payload as CandidatePayload, snapshot);
        return {
          ...dto,
          comparison: {
            differences,
            recommendation: differences.length === 0 ? ("reject" as const) : ("update" as const),
          },
        };
      });
      return { job: { ...toJobDto(job), pending }, ...paginated(data, total, query) };
    },

    async decide(ctx: ServiceContext, jobId: string, recordId: string, input: DecisionInput) {
      return db.$transaction(async (tx) => {
        const record = requireFound(
          await tx.importRecord.findFirst({ where: { id: recordId, jobId, userId: ctx.userId } }),
        );
        const updated = await decideInTx(tx, ctx, record, input);
        await refreshJobStatus(tx, ctx.userId, jobId);
        return toRecordDto(updated);
      });
    },

    /**
     * Bulk resolution. accept_new accepts valid, non-duplicate pending records in dependency
     * order (skills/technologies/evidence before the records that reference them); a record
     * that turns out to conflict is left pending for individual review.
     */
    async resolve(ctx: ServiceContext, jobId: string, action: "accept_new" | "reject_pending") {
      requireFound(await db.importJob.findFirst({ where: { id: jobId, userId: ctx.userId } }));
      const pending = await db.importRecord.findMany({
        where: { userId: ctx.userId, jobId, reviewStatus: "pending" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      let accepted = 0;
      let rejected = 0;
      let skipped = 0;

      if (action === "reject_pending") {
        await db.$transaction(
          async (tx) => {
            for (const record of pending) {
              await decideInTx(tx, ctx, record, { action: "reject" });
              rejected++;
            }
            await refreshJobStatus(tx, ctx.userId, jobId);
          },
          { timeout: 60_000 },
        );
        return { accepted, rejected, skipped };
      }

      const ordered = [...pending]
        .filter((r) => r.validationStatus === "valid" && r.match === "new")
        .sort((a, b) => ACCEPT_ORDER.indexOf(a.entityType) - ACCEPT_ORDER.indexOf(b.entityType));
      skipped = pending.length - ordered.length;
      for (const record of ordered) {
        try {
          // One transaction per record: a conflict leaves only that record pending.
          await db.$transaction(async (tx) => {
            await decideInTx(tx, ctx, record, { action: "accept", mode: undefined });
          });
          accepted++;
        } catch (error) {
          if (
            error instanceof AppError &&
            (error.code === "CONFLICT" || error.code === "VALIDATION_FAILED")
          ) {
            skipped++;
            await db.importRecord
              .update({
                where: { id: record.id },
                data: { errorMessage: error.message },
              })
              .catch(() => undefined);
            continue;
          }
          throw error;
        }
      }
      await db.$transaction((tx) => refreshJobStatus(tx, ctx.userId, jobId));
      return { accepted, rejected, skipped };
    },
  };
}
