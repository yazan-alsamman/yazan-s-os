import { z } from "zod";

import { paginationQuerySchema, searchTermSchema, sortSchema } from "@/lib/http/pagination";
import {
  achievementsSchema,
  datesOrdered,
  optionalIsoDate,
  optionalLongText,
  optionalText,
  requiredText,
} from "@/modules/shared/fields";

/** Education (ADR 0012). Dates are optional: sources such as LinkedIn often omit them. */
export const educationFields = {
  institution: requiredText(200),
  degree: optionalText(200),
  fieldOfStudy: optionalText(200),
  startDate: optionalIsoDate,
  endDate: optionalIsoDate,
  description: optionalLongText(),
  achievements: achievementsSchema.optional(),
};

export const createEducationSchema = z
  .object(educationFields)
  .refine((v) => datesOrdered(v.startDate, v.endDate), {
    message: "End date must not be before the start date",
    path: ["endDate"],
  });

export const updateEducationSchema = z
  .object(educationFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const listEducationQuerySchema = paginationQuerySchema.extend({
  q: searchTermSchema,
  sort: sortSchema(["startDate", "endDate", "institution", "updatedAt"], "-startDate"),
});

export type CreateEducationInput = z.infer<typeof createEducationSchema>;
export type UpdateEducationInput = z.infer<typeof updateEducationSchema>;
export type ListEducationQuery = z.infer<typeof listEducationQuerySchema>;
