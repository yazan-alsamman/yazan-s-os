import type { z } from "zod";

import { AppError } from "@/lib/errors/app-error";

/** Validate untrusted input against a schema, throwing a VALIDATION_FAILED AppError. */
export function parseInput<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
): z.output<TSchema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError("VALIDATION_FAILED", {
      details: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return result.data;
}
