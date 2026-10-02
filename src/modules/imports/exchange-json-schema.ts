import { z } from "zod";

import { certificationFields } from "@/modules/certifications/certification.schemas";
import { educationFields } from "@/modules/education/education.schemas";
import { evidenceFields } from "@/modules/evidence/evidence.schemas";
import { experienceFields } from "@/modules/experiences/experience.schemas";
import { localeSchema, timezoneSchema } from "@/modules/profile/profile.schemas";
import { projectFields, technologyUsageTypeSchema } from "@/modules/projects/project.schemas";
import { evidenceStrengthSchema, skillFields } from "@/modules/skills/skill.schemas";
import { technologyFields } from "@/modules/technologies/technology.schemas";

import { EXCHANGE_FORMAT, EXCHANGE_VERSION } from "./exchange-format";

/**
 * Machine-readable JSON Schema of the PEOS exchange format (11 "documented seed JSON schema",
 * 09 "seed data format"). Composed from the same field validators the importer uses, so it
 * cannot drift silently: data/peos-exchange.schema.json is checked by a unit test.
 * Cross-field rules (date order, level-model ranges) are enforced on import, not in the schema.
 */
const names = z
  .array(z.string().min(1).max(300))
  .describe("Names/titles of existing records to link");

export function buildExchangeDocumentSchema() {
  return z
    .object({
      $schema: z.string().optional(),
      format: z.literal(EXCHANGE_FORMAT),
      version: z.literal(EXCHANGE_VERSION),
      exportedAt: z.string().optional(),
      profile: z
        .object({
          name: z.string().optional(),
          timezone: timezoneSchema.optional(),
          locale: localeSchema.optional(),
          headline: z.string().nullish(),
          summary: z.string().nullish(),
          location: z.string().nullish(),
          website: z.string().nullish(),
          professionalObjective: z.string().nullish(),
        })
        .nullable()
        .optional(),
      experiences: z
        .array(z.object({ ...experienceFields, evidence: names.optional() }))
        .optional(),
      education: z.array(z.object(educationFields)).optional(),
      skills: z
        .array(
          z.object({
            ...skillFields,
            evidence: z
              .array(
                z.object({
                  title: z.string(),
                  strength: evidenceStrengthSchema.optional(),
                  date: z.string().optional(),
                }),
              )
              .optional(),
          }),
        )
        .optional(),
      technologies: z.array(z.object(technologyFields)).optional(),
      certifications: z
        .array(
          z.object({
            ...certificationFields,
            skills: names.optional(),
            evidence: names.optional(),
          }),
        )
        .optional(),
      projects: z
        .array(
          z.object({
            ...projectFields,
            skills: names.optional(),
            technologies: z
              .array(
                z.object({
                  name: z.string(),
                  usageType: technologyUsageTypeSchema.optional(),
                  proficiencyEvidence: z.string().optional(),
                }),
              )
              .optional(),
            evidence: names.optional(),
          }),
        )
        .optional(),
      evidence: z.array(z.object(evidenceFields)).optional(),
    })
    .describe("PEOS exchange document (peos.exchange v1)");
}

export function buildExchangeJsonSchema() {
  return {
    $id: "https://peos.invalid/schemas/peos-exchange-v1.json",
    title: "PEOS exchange document v1",
    ...z.toJSONSchema(buildExchangeDocumentSchema(), { io: "input", unrepresentable: "any" }),
  };
}
