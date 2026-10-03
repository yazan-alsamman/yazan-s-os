import { z } from "zod";

import { GoalConfidence, GoalStatus, GoalType } from "@/generated/prisma/enums";
import { booleanQuerySchema, paginationQuerySchema, searchTermSchema } from "@/lib/http/pagination";
import {
  idSetSchema,
  isoDate,
  optionalIsoDate,
  optionalLongText,
  optionalText,
  requiredText,
  uuidSchema,
} from "@/modules/shared/fields";

export const goalTypeSchema = z.enum(GoalType);
export const goalStatusSchema = z.enum(GoalStatus);
export const goalConfidenceSchema = z.enum(GoalConfidence);

const finite = z.number().finite().min(-1e12).max(1e12);

/** Spec 04 Goal + 01 §8 (ADR 0031). Owner comes from the session; ids of relations use own routes. */
const goalFields = {
  title: requiredText(200),
  type: goalTypeSchema,
  parentId: uuidSchema.nullable().optional(),
  description: optionalLongText(4_000),
  outcome: optionalLongText(2_000),
  metric: optionalText(120),
  unit: optionalText(30),
  baseline: finite.nullable().optional(),
  target: finite.nullable().optional(),
  startDate: optionalIsoDate,
  deadline: optionalIsoDate,
  status: goalStatusSchema.optional(),
  completedAt: optionalIsoDate,
  confidence: goalConfidenceSchema.nullable().optional(),
};

export const createGoalSchema = z.object(goalFields);

export const updateGoalSchema = z
  .object(goalFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update");

export const goalProjectsSchema = z.object({ projectIds: idSetSchema });
export const goalSkillsSchema = z.object({ skillIds: idSetSchema });
export const goalDependenciesSchema = z.object({ goalIds: idSetSchema });
export const goalMilestonesSchema = z.object({ milestoneIds: idSetSchema });

export const createMeasurementSchema = z.object({
  date: isoDate,
  value: finite,
  note: optionalText(300),
});

const RISK = ["at_risk", "on_track", "not_assessable", "not_applicable"] as const;
const ATTAINMENT = ["attained", "in_progress", "regressed", "not_computable"] as const;

/** GET /api/v1/goals — the single source list for every goal metric (ADR 0034). */
export const listGoalsQuerySchema = paginationQuerySchema.extend({
  q: searchTermSchema,
  status: goalStatusSchema.optional(),
  type: goalTypeSchema.optional(),
  /** Open = active or on hold. */
  open: booleanQuerySchema,
  /** Committed = active, on hold or completed (the target-attainment population). */
  committed: booleanQuerySchema,
  parentId: uuidSchema.optional(),
  /** Top-level goals only (no parent). */
  root: booleanQuerySchema,
  projectId: uuidSchema.optional(),
  skillId: uuidSchema.optional(),
  hasDeadline: booleanQuerySchema,
  hasProjects: booleanQuerySchema,
  hasSkills: booleanQuerySchema,
  deadlineFrom: isoDate.optional(),
  deadlineTo: isoDate.optional(),
  completedFrom: isoDate.optional(),
  completedTo: isoDate.optional(),
  overdue: booleanQuerySchema,
  risk: z.enum(RISK).optional(),
  attainment: z.enum(ATTAINMENT).optional(),
  /** At least one linked skill below its target (skill intelligence). */
  skillGap: booleanQuerySchema,
  sort: z.enum(["deadline", "title", "status", "updatedAt", "risk"]).default("deadline"),
});

export const roadmapQuerySchema = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    path: ["to"],
    message: "The end must not be before the start",
  })
  .refine((v) => !v.from || !v.to || (v.to.getTime() - v.from.getTime()) / 86_400_000 <= 366 * 5, {
    path: ["to"],
    message: "A roadmap window may span at most 5 years",
  });

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
export type ListGoalsQuery = z.infer<typeof listGoalsQuerySchema>;
