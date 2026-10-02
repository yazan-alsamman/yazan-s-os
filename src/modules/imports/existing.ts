import type { ImportRecord, PrismaClient } from "@/generated/prisma/client";
import type { ImportEntityType } from "@/generated/prisma/enums";
import { toDateOnly } from "@/modules/shared/fields";

import type { CandidatePayload } from "./candidates";

/**
 * Conflict presentation (11 "Conflict Resolution": Source A, Source B, Difference, Recommended
 * resolution). Loads the existing records matched by pending duplicates and diffs them against
 * the imported candidate, field by field.
 */
type Snapshot = Record<string, unknown>;

const RELATION_FIELDS = new Set(["skills", "technologies", "evidence"]);

function plain(record: Record<string, unknown>): Snapshot {
  const out: Snapshot = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = value instanceof Date ? toDateOnly(value) : value;
  }
  return out;
}

export async function loadExistingSnapshots(
  db: PrismaClient,
  userId: string,
  records: Pick<ImportRecord, "entityType" | "matchedEntityId">[],
): Promise<Map<string, Snapshot>> {
  const ids = (type: ImportEntityType) =>
    records
      .filter((r) => r.entityType === type && r.matchedEntityId)
      .map((r) => r.matchedEntityId!);
  const result = new Map<string, Snapshot>();
  const add = (rows: { id: string }[]) => rows.forEach((r) => result.set(r.id, plain(r)));
  const omit = {
    userId: true,
    origin: true,
    importRecordId: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  const [
    skills,
    technologies,
    projects,
    certifications,
    evidence,
    experiences,
    education,
    profiles,
  ] = await Promise.all([
    db.skill.findMany({
      where: { userId, id: { in: ids("skill") } },
      omit: { ...omit, key: true },
    }),
    db.technology.findMany({
      where: { userId, id: { in: ids("technology") } },
      omit: { ...omit, key: true },
    }),
    db.project.findMany({ where: { userId, id: { in: ids("project") } }, omit }),
    db.certification.findMany({ where: { userId, id: { in: ids("certification") } }, omit }),
    db.evidence.findMany({
      where: { userId, id: { in: ids("evidence") } },
      omit: { ...omit, verifiedAt: true },
    }),
    db.experience.findMany({ where: { userId, id: { in: ids("experience") } }, omit }),
    db.education.findMany({ where: { userId, id: { in: ids("education") } }, omit }),
    ids("profile").length
      ? db.profile.findMany({
          where: { userId, id: { in: ids("profile") } },
          omit,
          include: { user: { select: { name: true, timezone: true, locale: true } } },
        })
      : Promise.resolve([]),
  ]);
  add(skills);
  add(technologies);
  add(projects);
  add(certifications);
  add(evidence);
  add(experiences);
  add(education);
  for (const { user, ...profile } of profiles)
    result.set(profile.id, plain({ ...profile, ...user }));
  return result;
}

export interface FieldDifference {
  field: string;
  existing: unknown;
  imported: unknown;
}

function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b))
    return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  return (a ?? null) === (b ?? null);
}

/** Fields present in the candidate whose value differs from the existing record. */
export function diffAgainst(payload: CandidatePayload, existing: Snapshot): FieldDifference[] {
  return Object.entries(payload)
    .filter(([field]) => !RELATION_FIELDS.has(field) && field in existing)
    .filter(([field, value]) => !same(value, existing[field]))
    .map(([field, imported]) => ({ field, existing: existing[field] ?? null, imported }));
}
