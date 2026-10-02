import { z } from "zod";

import {
  ImportEntityType,
  ImportReviewStatus,
  ImportSource,
  ImportValidationStatus,
} from "@/generated/prisma/enums";
import { paginationQuerySchema } from "@/lib/http/pagination";

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const ALLOWED_EXTENSIONS: Record<ImportSource, readonly string[]> = {
  peos_json: [".json"],
  csv: [".csv"],
  linkedin_csv: [".csv"],
};
/** Browsers report CSV/JSON inconsistently; anything else is refused. */
export const ALLOWED_MIME_TYPES = new Set([
  "",
  "application/json",
  "text/json",
  "text/csv",
  "text/plain",
  "application/csv",
  "application/vnd.ms-excel",
  "text/x-csv",
]);

export const importSourceSchema = z.enum(ImportSource);
export const importEntityTypeSchema = z.enum(ImportEntityType);

export const uploadFieldsSchema = z.object({
  source: importSourceSchema,
  entityType: importEntityTypeSchema.optional(),
});

export const listImportRecordsQuerySchema = paginationQuerySchema.extend({
  reviewStatus: z.enum(ImportReviewStatus).optional(),
  validationStatus: z.enum(ImportValidationStatus).optional(),
  entityType: importEntityTypeSchema.optional(),
});

export const decisionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept"), mode: z.enum(["create", "update"]).optional() }),
  z.object({ action: z.literal("reject") }),
]);

export const resolveSchema = z.object({
  /** accept_new: accept every valid, non-duplicate pending record. reject_pending: reject the rest. */
  action: z.enum(["accept_new", "reject_pending"]),
});

export type ListImportRecordsQuery = z.infer<typeof listImportRecordsQuerySchema>;
export type DecisionInput = z.infer<typeof decisionSchema>;
