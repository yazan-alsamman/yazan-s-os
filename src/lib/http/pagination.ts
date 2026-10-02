import { z } from "zod";

/**
 * Offset pagination (ADR 0015). Personal collections are small (hundreds to low thousands of
 * rows), so offset paging with a stable `id` tie-breaker is deterministic and simple.
 */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  page: PageInfo;
}

export function toSkipTake({ page, pageSize }: PaginationQuery) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function paginated<T>(data: T[], total: number, query: PaginationQuery): Paginated<T> {
  return {
    data,
    page: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

/**
 * Whitelisted sort parameter: `field` (ascending) or `-field` (descending).
 * Returns a Prisma `orderBy` list with `id` appended as a deterministic tie-breaker.
 */
export function sortSchema<const TField extends string>(
  fields: readonly TField[],
  fallback: `${"" | "-"}${TField}`,
) {
  const allowed = new Set<string>(fields);
  return z
    .string()
    .default(fallback)
    .refine((value) => allowed.has(value.replace(/^-/, "")), {
      message: `Sort by one of: ${fields.join(", ")} (prefix with - for descending)`,
    })
    .transform((value) => {
      const descending = value.startsWith("-");
      const field = value.replace(/^-/, "") as TField;
      return [
        { [field]: descending ? "desc" : "asc" } as Record<TField, "asc" | "desc">,
        { id: "asc" as const },
      ];
    });
}

/** Convert URLSearchParams into a plain object for Zod (last value wins; empty values dropped). */
export function searchParamsToObject(params: URLSearchParams): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of params) {
    if (value !== "") result[key] = value;
  }
  return result;
}

/** Shared optional free-text search term. */
export const searchTermSchema = z.string().trim().min(1).max(200).optional();

/** "true" | "false" query flag. */
export const booleanQuerySchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();
