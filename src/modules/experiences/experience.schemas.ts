import { z } from "zod";

import {
  booleanQuerySchema,
  paginationQuerySchema,
  searchTermSchema,
  sortSchema,
} from "@/lib/http/pagination";
import {
  achievementsSchema,
  datesOrdered,
  isoDate,
  optionalIsoDate,
  optionalLongText,
  requiredText,
} from "@/modules/shared/fields";

export const experienceFields = {
  organization: requiredText(200),
  title: requiredText(200),
  startDate: isoDate,
  /** Omit or null for a current position. */
  endDate: optionalIsoDate,
  description: optionalLongText(),
  achievements: achievementsSchema.optional(),
};

export const createExperienceSchema = z
  .object(experienceFields)
  .refine((v) => datesOrdered(v.startDate, v.endDate), {
    message: "End date must not be before the start date",
    path: ["endDate"],
  });

export const updateExperienceSchema = z
  .object(experienceFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const listExperiencesQuerySchema = paginationQuerySchema.extend({
  q: searchTermSchema,
  current: booleanQuerySchema,
  sort: sortSchema(["startDate", "endDate", "organization", "title", "updatedAt"], "-startDate"),
});

export type CreateExperienceInput = z.infer<typeof createExperienceSchema>;
export type UpdateExperienceInput = z.infer<typeof updateExperienceSchema>;
export type ListExperiencesQuery = z.infer<typeof listExperiencesQuerySchema>;
