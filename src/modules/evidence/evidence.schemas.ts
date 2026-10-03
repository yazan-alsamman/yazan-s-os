import { z } from "zod";

import { EvidenceType, RecordOrigin } from "@/generated/prisma/enums";
import {
  booleanQuerySchema,
  paginationQuerySchema,
  searchTermSchema,
  sortSchema,
} from "@/lib/http/pagination";
import {
  isoDate,
  optionalHttpUrl,
  optionalIsoDate,
  optionalLongText,
  requiredText,
  uuidSchema,
} from "@/modules/shared/fields";

export const evidenceTypeSchema = z.enum(EvidenceType);

export const evidenceFields = {
  type: evidenceTypeSchema,
  title: requiredText(300),
  description: optionalLongText(),
  sourceUrl: optionalHttpUrl,
  /** External file location until object storage arrives (Phase 10). */
  fileUrl: optionalHttpUrl,
  date: optionalIsoDate,
  verified: z.boolean().optional(),
};

export const createEvidenceSchema = z.object(evidenceFields);

export const updateEvidenceSchema = z
  .object(evidenceFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const listEvidenceQuerySchema = paginationQuerySchema.extend({
  q: searchTermSchema,
  type: evidenceTypeSchema.optional(),
  verified: booleanQuerySchema,
  origin: z.enum(RecordOrigin).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  /** true = has an evidence date, false = undated (Command Center drill-down). */
  dated: booleanQuerySchema,
  /** Evidence linked to one project — project dossier drill-down (Phase 3). */
  projectId: uuidSchema.optional(),
  /** Evidence linked to one skill — skill dossier drill-down (Phase 4). */
  skillId: uuidSchema.optional(),
  sort: sortSchema(["title", "date", "type", "updatedAt", "createdAt"], "-date"),
});

export type CreateEvidenceInput = z.infer<typeof createEvidenceSchema>;
export type UpdateEvidenceInput = z.infer<typeof updateEvidenceSchema>;
export type ListEvidenceQuery = z.infer<typeof listEvidenceQuerySchema>;
