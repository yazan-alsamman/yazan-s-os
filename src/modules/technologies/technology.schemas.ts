import { z } from "zod";

import { paginationQuerySchema, searchTermSchema, sortSchema } from "@/lib/http/pagination";
import { optionalLongText, optionalText, requiredText } from "@/modules/shared/fields";

export const technologyFields = {
  name: requiredText(120),
  category: optionalText(80),
  version: optionalText(40),
  notes: optionalLongText(4_000),
};

export const createTechnologySchema = z.object(technologyFields);

export const updateTechnologySchema = z
  .object(technologyFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const listTechnologiesQuerySchema = paginationQuerySchema.extend({
  q: searchTermSchema,
  category: z.string().trim().max(80).optional(),
  sort: sortSchema(["name", "category", "updatedAt", "createdAt"], "name"),
});

export type CreateTechnologyInput = z.infer<typeof createTechnologySchema>;
export type UpdateTechnologyInput = z.infer<typeof updateTechnologySchema>;
export type ListTechnologiesQuery = z.infer<typeof listTechnologiesQuerySchema>;
