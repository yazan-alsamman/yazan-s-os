import type { ImportEntityType } from "@/generated/prisma/enums";
import type { Tx } from "@/modules/shared/audit";
import { normalizeKey, slugify, toDateOnly } from "@/modules/shared/fields";

/**
 * Duplicate detection (11 "Duplicate Detection"). Each entity type has a natural key; a
 * candidate whose key matches an existing record of the same user is a "duplicate" and must be
 * explicitly resolved (update existing / create anyway / reject). Nothing is overwritten silently.
 */
type Entity = Record<string, unknown>;

const k = (value: unknown) => (typeof value === "string" ? normalizeKey(value) : "");
const d = (value: unknown) => (value instanceof Date ? (toDateOnly(value) ?? "") : "");

export function naturalKey(entityType: ImportEntityType, e: Entity): string {
  switch (entityType) {
    case "profile":
      return "profile";
    case "skill":
    case "technology":
      return k(e.name);
    case "project":
      return typeof e.slug === "string" && e.slug
        ? `slug:${e.slug}`
        : `slug:${slugify(String(e.name ?? ""))}`;
    case "certification":
      return `${k(e.name)}|${k(e.issuer)}`;
    case "evidence":
      return `${k(e.title)}|${String(e.type ?? "")}`;
    case "experience":
      return `${k(e.organization)}|${k(e.title)}|${d(e.startDate)}`;
    case "education":
      return `${k(e.institution)}|${k(e.degree)}`;
  }
}

/** Load the natural keys of the user's existing records, for the entity types in a batch. */
export async function buildMatcher(tx: Tx, userId: string, types: Set<ImportEntityType>) {
  const index = new Map<string, string>();
  const put = (type: ImportEntityType, key: string, id: string) => {
    if (!index.has(`${type}:${key}`)) index.set(`${type}:${key}`, id);
  };

  if (types.has("profile")) {
    const profile = await tx.profile.findUnique({ where: { userId }, select: { id: true } });
    if (profile) put("profile", "profile", profile.id);
  }
  if (types.has("skill")) {
    for (const s of await tx.skill.findMany({
      where: { userId },
      select: { id: true, key: true },
    })) {
      put("skill", s.key, s.id);
    }
  }
  if (types.has("technology")) {
    for (const t of await tx.technology.findMany({
      where: { userId },
      select: { id: true, key: true },
    })) {
      put("technology", t.key, t.id);
    }
  }
  if (types.has("project")) {
    for (const p of await tx.project.findMany({
      where: { userId },
      select: { id: true, slug: true },
    })) {
      put("project", `slug:${p.slug}`, p.id);
    }
  }
  if (types.has("certification")) {
    const rows = await tx.certification.findMany({
      where: { userId },
      select: { id: true, name: true, issuer: true },
    });
    for (const c of rows) put("certification", naturalKey("certification", c), c.id);
  }
  if (types.has("evidence")) {
    const rows = await tx.evidence.findMany({
      where: { userId },
      select: { id: true, title: true, type: true },
    });
    for (const e of rows) put("evidence", naturalKey("evidence", e), e.id);
  }
  if (types.has("experience")) {
    const rows = await tx.experience.findMany({
      where: { userId },
      select: { id: true, organization: true, title: true, startDate: true },
    });
    for (const e of rows) put("experience", naturalKey("experience", e), e.id);
  }
  if (types.has("education")) {
    const rows = await tx.education.findMany({
      where: { userId },
      select: { id: true, institution: true, degree: true },
    });
    for (const e of rows) put("education", naturalKey("education", e), e.id);
  }

  return (entityType: ImportEntityType, entity: Entity): string | null =>
    index.get(`${entityType}:${naturalKey(entityType, entity)}`) ?? null;
}
