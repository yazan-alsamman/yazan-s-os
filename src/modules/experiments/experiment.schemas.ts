import { z } from "zod";

import {
  ExperimentDecision,
  ExperimentRunStatus,
  ExperimentStatus,
} from "@/generated/prisma/enums";
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

export const experimentStatusSchema = z.enum(ExperimentStatus);
export const experimentDecisionSchema = z.enum(ExperimentDecision);
export const runStatusSchema = z.enum(ExperimentRunStatus);

const finite = z.number().finite().min(-1e12).max(1e12);
const nonNegative = z.number().finite().min(0).max(1e12);
const nonNegativeInt = z.number().int().min(0).max(1_000_000_000);

/** Spec 04 AIExperiment (ADR 0036). Owner is the session; the project is validated for ownership. */
const experimentFields = {
  title: requiredText(200),
  projectId: uuidSchema.nullable().optional(),
  hypothesis: optionalLongText(4_000),
  objective: optionalLongText(2_000),
  category: optionalText(80),
  status: experimentStatusSchema.optional(),
  decision: experimentDecisionSchema.nullable().optional(),
  result: optionalLongText(4_000),
  reproducibilityNote: optionalLongText(2_000),
  startedAt: optionalIsoDate,
  completedAt: optionalIsoDate,
};

export const createExperimentSchema = z.object(experimentFields);
export const updateExperimentSchema = z
  .object(experimentFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update");

/** 04 AIExperiment model/version/prompt/dataset + measured cost/latency/tokens live on a run. */
const runFields = {
  label: optionalText(120),
  status: runStatusSchema.optional(),
  model: optionalText(120),
  modelVersion: optionalText(120),
  provider: optionalText(120),
  promptVersion: optionalText(120),
  datasetName: optionalText(200),
  datasetVersion: optionalText(120),
  codeRef: optionalText(200),
  environment: optionalText(200),
  runAt: optionalIsoDate,
  costUsd: nonNegative.nullable().optional(),
  latencyMs: nonNegative.nullable().optional(),
  tokensInput: nonNegativeInt.nullable().optional(),
  tokensOutput: nonNegativeInt.nullable().optional(),
  notes: optionalLongText(4_000),
};

export const createRunSchema = z.object(runFields);
export const updateRunSchema = z
  .object(runFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update");

/** 04 ExperimentMetric. A recorded evaluation result; `value` is a real measured number. */
export const createMetricSchema = z.object({
  name: requiredText(80),
  value: finite,
  unit: optionalText(40),
  higherIsBetter: z.boolean().nullable().optional(),
  note: optionalText(300),
});

export const experimentEvidenceSchema = z.object({ evidenceIds: idSetSchema });

/** GET /api/v1/experiments — the single source list for every AI Lab metric (ADR 0038). */
export const listExperimentsQuerySchema = paginationQuerySchema.extend({
  q: searchTermSchema,
  status: experimentStatusSchema.optional(),
  decision: experimentDecisionSchema.optional(),
  category: optionalText(80),
  projectId: uuidSchema.optional(),
  open: booleanQuerySchema,
  hasRuns: booleanQuerySchema,
  hasEvaluation: booleanQuerySchema,
  hasEvidence: booleanQuerySchema,
  reproducibility: z.enum(["reproducible", "partial", "not_reproducible", "unknown"]).optional(),
  createdFrom: isoDate.optional(),
  createdTo: isoDate.optional(),
  sort: z.enum(["createdAt", "title", "status", "runs", "updatedAt"]).default("updatedAt"),
});

/** GET /api/v1/experiments/:id/compare?a=<runId>&b=<runId> */
export const compareQuerySchema = z.object({
  a: uuidSchema,
  b: uuidSchema,
});

export type CreateExperimentInput = z.infer<typeof createExperimentSchema>;
export type UpdateExperimentInput = z.infer<typeof updateExperimentSchema>;
export type CreateRunInput = z.infer<typeof createRunSchema>;
export type UpdateRunInput = z.infer<typeof updateRunSchema>;
export type CreateMetricInput = z.infer<typeof createMetricSchema>;
export type ListExperimentsQuery = z.infer<typeof listExperimentsQuerySchema>;

export type CompareQuery = z.infer<typeof compareQuerySchema>;
