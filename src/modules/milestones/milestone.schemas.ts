import { z } from "zod";

import { MilestoneStatus } from "@/generated/prisma/enums";
import {
  booleanQuerySchema,
  paginationQuerySchema,
  searchTermSchema,
  sortSchema,
} from "@/lib/http/pagination";
import { isoDate, optionalIsoDate, requiredText, uuidSchema } from "@/modules/shared/fields";

export const milestoneStatusSchema = z.enum(MilestoneStatus);

/** Fields of spec 04 Milestone (goalId deferred to Phase 5 — ADR 0022). No owner/project ids. */
const milestoneFields = {
  title: requiredText(200),
  dueDate: optionalIsoDate,
  status: milestoneStatusSchema.optional(),
  completedAt: optionalIsoDate,
};

export const createMilestoneSchema = z.object(milestoneFields);

export const updateMilestoneSchema = z
  .object(milestoneFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

const listFields = {
  q: searchTermSchema,
  status: milestoneStatusSchema.optional(),
  /** Open milestones whose planned date has passed (ADR 0022). */
  overdue: booleanQuerySchema,
  /** planned/in_progress/blocked (true) or completed/cancelled (false). */
  open: booleanQuerySchema,
  dated: booleanQuerySchema,
  dueFrom: isoDate.optional(),
  dueTo: isoDate.optional(),
  completedFrom: isoDate.optional(),
  completedTo: isoDate.optional(),
  sort: sortSchema(["dueDate", "title", "status", "completedAt", "updatedAt"], "dueDate"),
};

/** Milestones of one project (GET /api/v1/projects/:id/milestones). */
export const listProjectMilestonesQuerySchema = paginationQuerySchema.extend(listFields);

/** Milestones across projects (GET /api/v1/milestones) — drill-down source list. */
export const listMilestonesQuerySchema = paginationQuerySchema.extend({
  ...listFields,
  projectId: uuidSchema.optional(),
});

export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;
export type ListMilestonesQuery = z.infer<typeof listMilestonesQuerySchema>;
