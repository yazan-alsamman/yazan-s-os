import type { ImportConfidence, ImportSource, RecordOrigin } from "@/generated/prisma/client";

/**
 * Provenance as required by 11_DATA_IMPORT_PROFILE.md: source, source file, importedAt, parser
 * version, confidence, reviewedAt, reviewedBy. Derived from the ImportRecord/ImportJob that
 * produced the record (ADR 0011), so it cannot drift from the import history.
 */
export const provenanceInclude = {
  importRecord: {
    select: {
      id: true,
      sourceRef: true,
      confidence: true,
      reviewedAt: true,
      reviewedBy: { select: { name: true } },
      job: {
        select: { id: true, source: true, fileName: true, parserVersion: true, createdAt: true },
      },
    },
  },
} as const;

export interface ProvenanceDto {
  origin: RecordOrigin;
  import: {
    recordId: string;
    jobId: string;
    source: ImportSource;
    fileName: string;
    sourceRef: string;
    parserVersion: string;
    importedAt: string;
    confidence: ImportConfidence;
    reviewedAt: string | null;
    reviewedBy: string | null;
  } | null;
}

interface ProvenanceSource {
  origin: RecordOrigin;
  importRecord?: {
    id: string;
    sourceRef: string;
    confidence: ImportConfidence;
    reviewedAt: Date | null;
    reviewedBy: { name: string } | null;
    job: {
      id: string;
      source: ImportSource;
      fileName: string;
      parserVersion: string;
      createdAt: Date;
    };
  } | null;
}

export function toProvenance(record: ProvenanceSource): ProvenanceDto {
  const imported = record.importRecord;
  return {
    origin: record.origin,
    import: imported
      ? {
          recordId: imported.id,
          jobId: imported.job.id,
          source: imported.job.source,
          fileName: imported.job.fileName,
          sourceRef: imported.sourceRef,
          parserVersion: imported.job.parserVersion,
          importedAt: imported.job.createdAt.toISOString(),
          confidence: imported.confidence,
          reviewedAt: imported.reviewedAt?.toISOString() ?? null,
          reviewedBy: imported.reviewedBy?.name ?? null,
        }
      : null,
  };
}
