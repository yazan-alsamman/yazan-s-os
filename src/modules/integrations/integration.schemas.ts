import { z } from "zod";

import { booleanQuerySchema, searchTermSchema } from "@/lib/http/pagination";
import { isoDate } from "@/modules/shared/fields";

/** Request contracts for the integration API (Phase 9.5). Closed enums; no owner identity accepted. */

export const integrationProviderSchema = z.enum(["github", "google"]);

export const oauthCallbackSchema = z.object({
  code: z.string().min(1).max(2048).optional(),
  state: z.string().min(1).max(4096).optional(),
  error: z.string().max(200).optional(),
  error_description: z.string().max(500).optional(),
});

const page = z.coerce.number().int().min(1).max(1000).default(1);
const perPage = z.coerce.number().int().min(1).max(50).default(30);

export const listReposQuerySchema = z.object({
  page,
  perPage,
  q: searchTermSchema,
  sort: z.enum(["updated", "pushed", "full_name", "created"]).default("updated"),
  visibility: z.enum(["all", "public", "private"]).default("all"),
  archived: booleanQuerySchema,
  fork: booleanQuerySchema,
});
export type ListReposQuery = z.infer<typeof listReposQuerySchema>;

export const listCommitsQuerySchema = z
  .object({
    page,
    perPage,
    sha: z.string().trim().min(1).max(100).optional(),
    since: isoDate.optional(),
    until: isoDate.optional(),
  })
  .transform((v) => ({
    ...v,
    since: v.since?.toISOString(),
    until: v.until?.toISOString(),
  }));

export const listActivityQuerySchema = z.object({ page, perPage });

export const linkProjectSchema = z.object({ projectId: z.uuid() });
export type LinkProjectInput = z.infer<typeof linkProjectSchema>;
