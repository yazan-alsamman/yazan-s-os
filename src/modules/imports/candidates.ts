import { z } from "zod";

import type { ImportEntityType } from "@/generated/prisma/enums";
import { createCertificationSchema } from "@/modules/certifications/certification.schemas";
import { createEducationSchema } from "@/modules/education/education.schemas";
import { createEvidenceSchema } from "@/modules/evidence/evidence.schemas";
import { createExperienceSchema } from "@/modules/experiences/experience.schemas";
import { updateProfileSchema } from "@/modules/profile/profile.schemas";
import { createProjectSchema, technologyUsageTypeSchema } from "@/modules/projects/project.schemas";
import { evidenceStrengthSchema } from "@/modules/skills/skill.schemas";
import { createSkillSchema } from "@/modules/skills/skill.schemas";
import { createTechnologySchema } from "@/modules/technologies/technology.schemas";

/**
 * Import candidates (ADR 0014). A candidate is the *normalised*, JSON-serialisable form of one
 * record from a source file. Field validation reuses the domain create-schemas exactly, so an
 * accepted import can never bypass the rules that manual entry follows. Relationships are
 * expressed by natural names (portable across accounts) and resolved at acceptance time.
 */
export type CandidatePayload = Record<string, unknown>;

export interface RawCandidate {
  entityType: ImportEntityType;
  sourceRef: string;
  payload: CandidatePayload;
}

const nameList = z.array(z.string().trim().min(1).max(300)).max(500);

const relationSchemas = {
  profile: z.object({}),
  experience: z.object({ evidence: nameList.optional() }),
  education: z.object({}),
  skill: z.object({
    evidence: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(300),
          strength: evidenceStrengthSchema.optional(),
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
        }),
      )
      .max(500)
      .optional(),
  }),
  technology: z.object({}),
  certification: z.object({ skills: nameList.optional(), evidence: nameList.optional() }),
  project: z.object({
    skills: nameList.optional(),
    technologies: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(300),
          usageType: technologyUsageTypeSchema.optional(),
          proficiencyEvidence: z.string().trim().max(2_000).optional(),
        }),
      )
      .max(200)
      .optional(),
    evidence: nameList.optional(),
  }),
  evidence: z.object({}),
} satisfies Record<ImportEntityType, z.ZodType>;

/** Domain validators. Project relation-id fields are not importable (ids are not portable). */
const entitySchemas = {
  profile: updateProfileSchema,
  experience: createExperienceSchema,
  education: createEducationSchema,
  skill: createSkillSchema,
  technology: createTechnologySchema,
  certification: createCertificationSchema,
  project: createProjectSchema,
  evidence: createEvidenceSchema,
} satisfies Record<ImportEntityType, z.ZodType>;

const RELATION_KEYS: Record<ImportEntityType, readonly string[]> = {
  profile: [],
  experience: ["evidence"],
  education: [],
  skill: ["evidence"],
  technology: [],
  certification: ["skills", "evidence"],
  project: ["skills", "technologies", "evidence"],
  evidence: [],
};

/** Fields that must never be taken from an import payload. */
const FORBIDDEN_KEYS = ["skillIds", "evidenceIds", "id", "userId", "origin", "importRecordId"];

export interface ValidationIssue {
  path: string;
  message: string;
}

export type CandidateValidation =
  | { valid: true; entity: Record<string, unknown>; relations: Record<string, unknown> }
  | { valid: false; issues: ValidationIssue[] };

/** Validate a candidate payload against the domain schema for its entity type. */
export function validateCandidate(
  entityType: ImportEntityType,
  payload: CandidatePayload,
): CandidateValidation {
  const relationKeys = RELATION_KEYS[entityType];
  const entityPart: Record<string, unknown> = {};
  const relationPart: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (FORBIDDEN_KEYS.includes(key)) continue;
    if (relationKeys.includes(key)) relationPart[key] = value;
    else entityPart[key] = value;
  }

  const issues: ValidationIssue[] = [];
  const entity = entitySchemas[entityType].safeParse(entityPart);
  if (!entity.success) {
    issues.push(
      ...entity.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  const relations = relationSchemas[entityType].safeParse(relationPart);
  if (!relations.success) {
    issues.push(
      ...relations.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  if (issues.length || !entity.success || !relations.success) return { valid: false, issues };
  return {
    valid: true,
    entity: entity.data as Record<string, unknown>,
    relations: relations.data as Record<string, unknown>,
  };
}

/** Dependency order for bulk acceptance: referenced records are created before referrers. */
export const ACCEPT_ORDER: readonly ImportEntityType[] = [
  "profile",
  "evidence", // referenced by skills, experiences, certifications and projects
  "skill",
  "technology",
  "experience",
  "education",
  "certification",
  "project",
];

/** Human-readable one-line label for a candidate (review queue). */
export function candidateLabel(entityType: ImportEntityType, payload: CandidatePayload): string {
  const s = (key: string) => (typeof payload[key] === "string" ? (payload[key] as string) : "");
  switch (entityType) {
    case "profile":
      return s("name") || s("headline") || "Profile";
    case "experience":
      return [s("title"), s("organization")].filter(Boolean).join(" · ") || "Experience";
    case "education":
      return [s("institution"), s("degree")].filter(Boolean).join(" · ") || "Education";
    case "certification":
      return [s("name"), s("issuer")].filter(Boolean).join(" · ") || "Certification";
    case "evidence":
      return s("title") || "Evidence";
    default:
      return s("name") || `Unnamed ${entityType}`;
  }
}
