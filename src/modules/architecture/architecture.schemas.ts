import { z } from "zod";

import { ComponentType, DecisionStatus } from "@/generated/prisma/enums";
import { booleanQuerySchema, paginationQuerySchema, searchTermSchema } from "@/lib/http/pagination";
import {
  idSetSchema,
  isoDate,
  optionalIsoDate,
  optionalLongText,
  requiredText,
  uuidSchema,
} from "@/modules/shared/fields";

export const decisionStatusSchema = z.enum(DecisionStatus);
export const componentTypeSchema = z.enum(ComponentType);

/** 04 ArchitectureDecision + 01 §5 Constraints (ADR 0041). Owner from the session only. */
const decisionFields = {
  title: requiredText(200),
  context: optionalLongText(10_000),
  problem: optionalLongText(10_000),
  constraints: optionalLongText(10_000),
  decision: optionalLongText(10_000),
  consequences: optionalLongText(10_000),
  decidedAt: optionalIsoDate,
  revisitDate: optionalIsoDate,
};

/** A new record starts as a proposal or an already-made decision (no history to supersede yet). */
export const createDecisionSchema = z.object({
  ...decisionFields,
  status: z.enum(["proposed", "accepted", "rejected"]).optional(),
});

export const updateDecisionSchema = z
  .object({
    ...decisionFields,
    status: decisionStatusSchema.optional(),
    supersededById: uuidSchema.nullable().optional(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update");

export const decisionProjectsSchema = z.object({ projectIds: idSetSchema });
export const decisionEvidenceSchema = z.object({ evidenceIds: idSetSchema });
export const decisionComponentsSchema = z.object({ componentIds: idSetSchema });

/** 04 ArchitectureAlternative (01 "Options"). */
export const alternativeSchema = z.object({
  name: requiredText(200),
  pros: optionalLongText(4_000),
  cons: optionalLongText(4_000),
  rejectedReason: optionalLongText(4_000),
});
export const updateAlternativeSchema = alternativeSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update");

/** GET /api/v1/architecture/decisions — the source list for every decision metric (ADR 0045). */
export const listDecisionsQuerySchema = paginationQuerySchema.extend({
  q: searchTermSchema,
  status: decisionStatusSchema.optional(),
  projectId: uuidSchema.optional(),
  componentId: uuidSchema.optional(),
  /** In force = accepted. */
  inForce: booleanQuerySchema,
  hasProjects: booleanQuerySchema,
  hasEvidence: booleanQuerySchema,
  hasAlternatives: booleanQuerySchema,
  revisitDue: booleanQuerySchema,
  staleCritical: booleanQuerySchema,
  /** At least one documentation gap (documentation-gaps-v1). */
  incomplete: booleanQuerySchema,
  decidedFrom: isoDate.optional(),
  decidedTo: isoDate.optional(),
  sort: z.enum(["decidedAt", "title", "status", "updatedAt", "revisitDate"]).default("decidedAt"),
});

/** 01 §5 Architecture Map node (ADR 0043). */
const componentFields = {
  name: requiredText(120),
  type: componentTypeSchema,
  purpose: optionalLongText(2_000),
  critical: z.boolean().optional(),
};
export const createComponentSchema = z.object(componentFields);
export const updateComponentSchema = z
  .object(componentFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update");

export const componentProjectsSchema = z.object({ projectIds: idSetSchema });
export const componentTechnologiesSchema = z.object({ technologyIds: idSetSchema });
export const componentDependenciesSchema = z.object({ componentIds: idSetSchema });

/** GET /api/v1/architecture/components — the component registry and its metrics' source list. */
export const listComponentsQuerySchema = paginationQuerySchema.extend({
  q: searchTermSchema,
  type: componentTypeSchema.optional(),
  critical: booleanQuerySchema,
  projectId: uuidSchema.optional(),
  technologyId: uuidSchema.optional(),
  hasDecisions: booleanQuerySchema,
  hasDependencies: booleanQuerySchema,
  sort: z.enum(["name", "type", "updatedAt"]).default("name"),
});

/** GET /api/v1/architecture/map — bounded component graph. */
export const mapQuerySchema = z.object({
  projectId: uuidSchema.optional(),
  type: componentTypeSchema.optional(),
  limit: z.coerce.number().int().min(10).max(150).default(100),
});

export type CreateDecisionInput = z.infer<typeof createDecisionSchema>;
export type UpdateDecisionInput = z.infer<typeof updateDecisionSchema>;
export type AlternativeInput = z.infer<typeof alternativeSchema>;
export type UpdateAlternativeInput = z.infer<typeof updateAlternativeSchema>;
export type ListDecisionsQuery = z.infer<typeof listDecisionsQuerySchema>;
export type CreateComponentInput = z.infer<typeof createComponentSchema>;
export type UpdateComponentInput = z.infer<typeof updateComponentSchema>;
export type ListComponentsQuery = z.infer<typeof listComponentsQuerySchema>;
export type MapQuery = z.infer<typeof mapQuerySchema>;
