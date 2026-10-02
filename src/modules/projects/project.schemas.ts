import { z } from "zod";

import { ProjectHealth, ProjectStatus, TechnologyUsageType } from "@/generated/prisma/enums";
import {
  booleanQuerySchema,
  paginationQuerySchema,
  searchTermSchema,
  sortSchema,
} from "@/lib/http/pagination";
import {
  idSetSchema,
  isoDate,
  optionalHttpUrl,
  optionalIsoDate,
  optionalLongText,
  requiredText,
  SLUG_PATTERN,
  uuidSchema,
} from "@/modules/shared/fields";

export const projectStatusSchema = z.enum(ProjectStatus);
export const projectHealthSchema = z.enum(ProjectHealth);
export const technologyUsageTypeSchema = z.enum(TechnologyUsageType);

export const projectSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(80, "At most 80 characters")
  .regex(SLUG_PATTERN, "Use lower-case letters, digits and single hyphens");

export const technologyLinkSchema = z.object({
  technologyId: uuidSchema,
  usageType: technologyUsageTypeSchema.default("core"),
  proficiencyEvidence: optionalLongText(2_000),
});

export const technologyLinksSchema = z
  .array(technologyLinkSchema)
  .max(200)
  .refine(
    (items) => new Set(items.map((i) => i.technologyId)).size === items.length,
    "Each technology may appear only once",
  );

const projectFields = {
  name: requiredText(200),
  slug: projectSlugSchema.optional(),
  description: optionalLongText(),
  problem: optionalLongText(),
  solution: optionalLongText(),
  impact: optionalLongText(),
  status: projectStatusSchema.optional(),
  healthStatus: projectHealthSchema.optional(),
  startDate: optionalIsoDate,
  targetDate: optionalIsoDate,
  completedAt: optionalIsoDate,
  repositoryUrl: optionalHttpUrl,
  demoUrl: optionalHttpUrl,
  productionUrl: optionalHttpUrl,
};

/** Create: fields + optional initial relationships, persisted in one transaction. */
export const createProjectSchema = z.object({
  ...projectFields,
  skillIds: idSetSchema.optional(),
  technologies: technologyLinksSchema.optional(),
  evidenceIds: idSetSchema.optional(),
});

/** Partial update of scalar fields. Relationships use the dedicated replace-set endpoints. */
export const updateProjectSchema = z
  .object(projectFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const listProjectsQuerySchema = paginationQuerySchema.extend({
  q: searchTermSchema,
  status: projectStatusSchema.optional(),
  healthStatus: projectHealthSchema.optional(),
  skillId: uuidSchema.optional(),
  technologyId: uuidSchema.optional(),
  startFrom: isoDate.optional(),
  startTo: isoDate.optional(),
  imported: booleanQuerySchema,
  sort: sortSchema(["name", "updatedAt", "startDate", "status", "createdAt"], "-updatedAt"),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
export type TechnologyLinkInput = z.infer<typeof technologyLinkSchema>;
