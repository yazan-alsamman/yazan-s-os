import { z } from "zod";

import type { ImportEntityType } from "@/generated/prisma/enums";

/**
 * PEOS exchange format ("peos.exchange" v1) — the JSON produced by export and accepted by import
 * (09 "seed data format", 11 "documented seed JSON schema"). Top-level structure is validated
 * strictly; each record is validated individually during import so one bad record does not hide
 * the rest. Export-only fields (id, provenance, timestamps) are ignored on import.
 */
export const EXCHANGE_FORMAT = "peos.exchange";
export const EXCHANGE_VERSION = 1;

const recordArray = z.array(z.record(z.string(), z.unknown())).max(2_000);

export const exchangeDocumentSchema = z
  .object({
    format: z.literal(EXCHANGE_FORMAT),
    version: z.literal(EXCHANGE_VERSION),
    exportedAt: z.string().optional(),
    profile: z.record(z.string(), z.unknown()).nullable().optional(),
    experiences: recordArray.optional(),
    education: recordArray.optional(),
    skills: recordArray.optional(),
    technologies: recordArray.optional(),
    certifications: recordArray.optional(),
    projects: recordArray.optional(),
    evidence: recordArray.optional(),
  })
  .strict();

export type ExchangeDocument = z.infer<typeof exchangeDocumentSchema>;

/** Collection key in the document → entity type. */
export const EXCHANGE_COLLECTIONS = {
  experiences: "experience",
  education: "education",
  skills: "skill",
  technologies: "technology",
  certifications: "certification",
  projects: "project",
  evidence: "evidence",
} as const satisfies Record<string, ImportEntityType>;
