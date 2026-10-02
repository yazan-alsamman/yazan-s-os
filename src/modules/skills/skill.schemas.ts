import { z } from "zod";

import { EvidenceStrength } from "@/generated/prisma/enums";
import {
  booleanQuerySchema,
  paginationQuerySchema,
  searchTermSchema,
  sortSchema,
} from "@/lib/http/pagination";
import {
  optionalIsoDate,
  optionalLongText,
  optionalText,
  requiredText,
  uuidSchema,
} from "@/modules/shared/fields";

import { DEFAULT_LEVEL_MODEL_ID, getLevelModel, isValidLevel } from "./level-models";

export const skillFields = {
  name: requiredText(120),
  category: optionalText(80),
  description: optionalLongText(4_000),
  levelModel: z
    .string()
    .refine((id) => Boolean(getLevelModel(id)), "Unknown level model")
    .optional(),
  targetLevel: z.number().int().min(0).max(10).nullable().optional(),
  active: z.boolean().optional(),
};

function levelMatchesModel(value: { levelModel?: string; targetLevel?: number | null }) {
  if (value.targetLevel === undefined || value.targetLevel === null) return true;
  return isValidLevel(value.levelModel ?? DEFAULT_LEVEL_MODEL_ID, value.targetLevel);
}

const levelIssue = {
  message: "Target level is not part of the level model",
  path: ["targetLevel"],
};

export const createSkillSchema = z.object(skillFields).refine(levelMatchesModel, levelIssue);

export const updateSkillSchema = z
  .object(skillFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const evidenceStrengthSchema = z.enum(EvidenceStrength);

export const skillEvidenceLinksSchema = z
  .array(
    z.object({
      evidenceId: uuidSchema,
      strength: evidenceStrengthSchema.default("moderate"),
      date: optionalIsoDate,
    }),
  )
  .max(500)
  .refine(
    (items) => new Set(items.map((i) => i.evidenceId)).size === items.length,
    "Each evidence item may appear only once",
  );

export const listSkillsQuerySchema = paginationQuerySchema.extend({
  q: searchTermSchema,
  category: z.string().trim().max(80).optional(),
  active: booleanQuerySchema,
  hasTarget: booleanQuerySchema,
  sort: sortSchema(["name", "category", "targetLevel", "updatedAt", "createdAt"], "name"),
});

export type CreateSkillInput = z.infer<typeof createSkillSchema>;
export type UpdateSkillInput = z.infer<typeof updateSkillSchema>;
export type ListSkillsQuery = z.infer<typeof listSkillsQuerySchema>;
export type SkillEvidenceLinkInput = z.infer<typeof skillEvidenceLinksSchema>[number];
