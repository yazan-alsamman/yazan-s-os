import { z } from "zod";

import {
  OpportunityPriority,
  OpportunityStatus,
  OpportunityType,
  RecordOrigin,
  RequirementImportance,
  RequirementKind,
} from "@/generated/prisma/enums";
import { paginationQuerySchema, searchTermSchema, sortSchema } from "@/lib/http/pagination";
import {
  idSetSchema,
  optionalHttpUrl,
  optionalIsoDate,
  optionalLongText,
  optionalText,
  requiredText,
  uuidSchema,
} from "@/modules/shared/fields";

export const opportunityTypeSchema = z.enum(OpportunityType);
export const opportunityStatusSchema = z.enum(OpportunityStatus);
export const opportunityPrioritySchema = z.enum(OpportunityPriority);
export const requirementImportanceSchema = z.enum(RequirementImportance);
export const requirementKindSchema = z.enum(RequirementKind);

export const opportunityFields = {
  title: requiredText(200),
  organization: optionalText(200),
  type: opportunityTypeSchema.optional(),
  status: opportunityStatusSchema.optional(),
  priority: opportunityPrioritySchema.optional(),
  description: optionalLongText(),
  source: optionalText(200),
  sourceUrl: optionalHttpUrl,
  location: optionalText(200),
  deadline: optionalIsoDate,
  nextAction: optionalText(300),
  notes: optionalLongText(),
};

export const createOpportunitySchema = z.object(opportunityFields);

export const updateOpportunitySchema = z
  .object(opportunityFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const listOpportunitiesQuerySchema = paginationQuerySchema.extend({
  q: searchTermSchema,
  type: opportunityTypeSchema.optional(),
  status: opportunityStatusSchema.optional(),
  priority: opportunityPrioritySchema.optional(),
  sort: sortSchema(
    ["title", "organization", "status", "priority", "deadline", "updatedAt", "createdAt"],
    "-updatedAt",
  ),
});

// ── Requirements ─────────────────────────────────────────────────────────────

/** At most one concrete link, and it must match the requirement kind (enforced in the service). */
export const requirementFields = {
  kind: requirementKindSchema,
  label: requiredText(200),
  description: optionalText(1_000),
  importance: requirementImportanceSchema.optional(),
  skillId: uuidSchema.nullish(),
  technologyId: uuidSchema.nullish(),
  certificationId: uuidSchema.nullish(),
};

export const createRequirementSchema = z.object(requirementFields);

export const updateRequirementSchema = z
  .object(requirementFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const requirementEvidenceSchema = z.object({ evidenceIds: idSetSchema });

export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;
export type ListOpportunitiesQuery = z.infer<typeof listOpportunitiesQuerySchema>;
export type CreateRequirementInput = z.infer<typeof createRequirementSchema>;
export type UpdateRequirementInput = z.infer<typeof updateRequirementSchema>;

export { RecordOrigin };
