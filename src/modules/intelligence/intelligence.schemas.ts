import { z } from "zod";

import {
  IntelligenceSeverity,
  IntelligenceSignalType,
  IntelligenceStatus,
} from "@/generated/prisma/enums";
import { paginationQuerySchema, sortSchema } from "@/lib/http/pagination";
import { uuidSchema } from "@/modules/shared/fields";

export const signalTypeSchema = z.enum(IntelligenceSignalType);
export const signalSeveritySchema = z.enum(IntelligenceSeverity);
export const signalStatusSchema = z.enum(IntelligenceStatus);

export const listSignalsQuerySchema = paginationQuerySchema.extend({
  type: signalTypeSchema.optional(),
  severity: signalSeveritySchema.optional(),
  status: signalStatusSchema.optional(),
  sort: sortSchema(["detectedAt", "severity", "createdAt"], "-detectedAt"),
});

/** Owner-driven lifecycle transitions on a signal (never AI-driven). */
export const updateSignalSchema = z.object({
  status: z.enum(["reviewed", "dismissed", "active"]),
});

export const candidateStatusSchema = z.enum(["candidate", "accepted", "rejected"]);

export const listCandidatesQuerySchema = paginationQuerySchema.extend({
  status: candidateStatusSchema.optional(),
  sort: sortSchema(["createdAt", "suggestedDate"], "-createdAt"),
});

/** Accepting a candidate may override the suggested title before it becomes real Evidence. */
export const acceptCandidateSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
  })
  .optional();

export const retrospectiveParamsSchema = z.object({ projectId: uuidSchema });

export const weeklyReviewQuerySchema = z.object({
  /** ISO date (any day) whose ISO week to return; defaults to the current week. */
  week: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type ListSignalsQuery = z.infer<typeof listSignalsQuerySchema>;
export type UpdateSignalInput = z.infer<typeof updateSignalSchema>;
export type ListCandidatesQuery = z.infer<typeof listCandidatesQuerySchema>;
export type AcceptCandidateInput = z.infer<typeof acceptCandidateSchema>;
