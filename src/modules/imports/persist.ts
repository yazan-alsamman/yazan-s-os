import type { ImportEntityType } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors/app-error";
import { certificationSnapshot } from "@/modules/certifications/certification.repository";
import type { CreateCertificationInput } from "@/modules/certifications/certification.schemas";
import type { CreateEducationInput } from "@/modules/education/education.schemas";
import { toEducationDto } from "@/modules/education/education.service";
import { toEvidenceDto } from "@/modules/evidence/evidence.repository";
import type { CreateEvidenceInput } from "@/modules/evidence/evidence.schemas";
import { toExperienceDto } from "@/modules/experiences/experience.repository";
import type { CreateExperienceInput } from "@/modules/experiences/experience.schemas";
import type { UpdateProfileInput } from "@/modules/profile/profile.schemas";
import { projectSnapshot } from "@/modules/projects/project.dto";
import type { CreateProjectInput } from "@/modules/projects/project.schemas";
import { auditInTx, type Tx } from "@/modules/shared/audit";
import { normalizeKey, slugify } from "@/modules/shared/fields";
import type { ServiceContext } from "@/modules/shared/service-context";
import { toSkillDto } from "@/modules/skills/skill.repository";
import type { CreateSkillInput } from "@/modules/skills/skill.schemas";
import { toTechnologyDto } from "@/modules/technologies/technology.repository";
import type { CreateTechnologyInput } from "@/modules/technologies/technology.schemas";

/**
 * Persist an accepted import candidate (ADR 0014). Runs inside the decision transaction:
 * the entity write, its provenance link, relationship resolution and audit entries commit
 * together with the review decision.
 *
 * - create: new record with origin "import" and import_record_id → full provenance.
 * - update: applies the candidate's provided fields to the matched record and points its
 *   provenance at this import record; relationships are not changed on update.
 * Relationship names that cannot be resolved to the user's existing records are reported as
 * notes, never auto-created (no unreviewed records).
 */
export interface PersistResult {
  entityId: string;
  notes: string[];
}

interface Args {
  tx: Tx;
  ctx: ServiceContext;
  importRecordId: string;
  entity: Record<string, unknown>;
  relations: Record<string, unknown>;
}

const provenance = (importRecordId: string) => ({ origin: "import" as const, importRecordId });

async function resolveByKey(
  tx: Tx,
  model: "skill" | "technology",
  userId: string,
  names: string[],
): Promise<{ found: Map<string, string>; missing: string[] }> {
  const keys = [...new Set(names.map(normalizeKey))];
  const rows =
    model === "skill"
      ? await tx.skill.findMany({
          where: { userId, key: { in: keys } },
          select: { id: true, key: true },
        })
      : await tx.technology.findMany({
          where: { userId, key: { in: keys } },
          select: { id: true, key: true },
        });
  const found = new Map(rows.map((r) => [r.key, r.id]));
  return { found, missing: names.filter((n) => !found.has(normalizeKey(n))) };
}

async function resolveEvidence(tx: Tx, userId: string, titles: string[]) {
  const unique = [...new Set(titles.map((t) => t.trim()))];
  const rows = unique.length
    ? await tx.evidence.findMany({
        where: {
          userId,
          OR: unique.map((title) => ({ title: { equals: title, mode: "insensitive" as const } })),
        },
        select: { id: true, title: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const found = new Map<string, string>();
  for (const row of rows)
    if (!found.has(normalizeKey(row.title))) found.set(normalizeKey(row.title), row.id);
  return { found, missing: unique.filter((t) => !found.has(normalizeKey(t))) };
}

function note(kind: string, missing: string[]) {
  return missing.length ? [`Not linked — no existing ${kind} named: ${missing.join(", ")}`] : [];
}

async function ownedOrThrow<T>(promise: Promise<T | null>): Promise<T> {
  const row = await promise;
  if (!row) throw new AppError("NOT_FOUND", { message: "The matched record no longer exists." });
  return row;
}

async function uniqueSlug(tx: Tx, userId: string, base: string) {
  for (let n = 1; n <= 50; n++) {
    const slug = n === 1 ? base : `${base.slice(0, 76)}-${n}`;
    if ((await tx.project.count({ where: { userId, slug } })) === 0) return slug;
  }
  return `${base.slice(0, 43)}-${crypto.randomUUID()}`;
}

type Persister = {
  create(args: Args): Promise<PersistResult>;
  update(args: Args & { targetId: string }): Promise<PersistResult>;
};

const persisters: Record<ImportEntityType, Persister> = {
  profile: {
    async create(args) {
      return persistProfile(args);
    },
    async update(args) {
      return persistProfile(args);
    },
  },

  skill: {
    async create({ tx, ctx, importRecordId, entity, relations }) {
      const input = entity as CreateSkillInput;
      const key = normalizeKey(input.name);
      if (await tx.skill.count({ where: { userId: ctx.userId, key } })) {
        throw new AppError("CONFLICT", {
          message: "A skill with this name already exists — choose update.",
        });
      }
      const skill = await tx.skill.create({
        data: { ...input, key, userId: ctx.userId, ...provenance(importRecordId) },
      });
      const notes = await linkSkillEvidence(tx, ctx.userId, skill.id, relations);
      await auditInTx(tx, ctx, {
        entity: "skill",
        verb: "created",
        entityId: skill.id,
        after: toSkillDto(skill),
      });
      return { entityId: skill.id, notes };
    },
    async update({ tx, ctx, importRecordId, entity, targetId }) {
      const input = entity as CreateSkillInput;
      const existing = await ownedOrThrow(
        tx.skill.findFirst({ where: { id: targetId, userId: ctx.userId } }),
      );
      const key = normalizeKey(input.name);
      if (key !== existing.key && (await tx.skill.count({ where: { userId: ctx.userId, key } }))) {
        throw new AppError("CONFLICT", { message: "Another skill already has this name." });
      }
      const updated = await tx.skill.update({
        where: { id: existing.id },
        data: { ...input, key, importRecordId },
      });
      await auditInTx(tx, ctx, {
        entity: "skill",
        verb: "updated",
        entityId: existing.id,
        before: toSkillDto(existing),
        after: toSkillDto(updated),
      });
      return { entityId: existing.id, notes: [] };
    },
  },

  technology: {
    async create({ tx, ctx, importRecordId, entity }) {
      const input = entity as CreateTechnologyInput;
      const key = normalizeKey(input.name);
      if (await tx.technology.count({ where: { userId: ctx.userId, key } })) {
        throw new AppError("CONFLICT", {
          message: "A technology with this name already exists — choose update.",
        });
      }
      const technology = await tx.technology.create({
        data: { ...input, key, userId: ctx.userId, ...provenance(importRecordId) },
      });
      await auditInTx(tx, ctx, {
        entity: "technology",
        verb: "created",
        entityId: technology.id,
        after: toTechnologyDto(technology),
      });
      return { entityId: technology.id, notes: [] };
    },
    async update({ tx, ctx, importRecordId, entity, targetId }) {
      const input = entity as CreateTechnologyInput;
      const existing = await ownedOrThrow(
        tx.technology.findFirst({ where: { id: targetId, userId: ctx.userId } }),
      );
      const key = normalizeKey(input.name);
      if (
        key !== existing.key &&
        (await tx.technology.count({ where: { userId: ctx.userId, key } }))
      ) {
        throw new AppError("CONFLICT", { message: "Another technology already has this name." });
      }
      const updated = await tx.technology.update({
        where: { id: existing.id },
        data: { ...input, key, importRecordId },
      });
      await auditInTx(tx, ctx, {
        entity: "technology",
        verb: "updated",
        entityId: existing.id,
        before: toTechnologyDto(existing),
        after: toTechnologyDto(updated),
      });
      return { entityId: existing.id, notes: [] };
    },
  },

  evidence: {
    async create({ tx, ctx, importRecordId, entity }) {
      const { verified, ...input } = entity as CreateEvidenceInput;
      const evidence = await tx.evidence.create({
        data: {
          ...input,
          verified: Boolean(verified),
          verifiedAt: verified ? new Date() : null,
          userId: ctx.userId,
          ...provenance(importRecordId),
        },
      });
      await auditInTx(tx, ctx, {
        entity: "evidence",
        verb: "created",
        entityId: evidence.id,
        after: toEvidenceDto(evidence),
      });
      return { entityId: evidence.id, notes: [] };
    },
    async update({ tx, ctx, importRecordId, entity, targetId }) {
      const { verified, ...input } = entity as CreateEvidenceInput;
      const existing = await ownedOrThrow(
        tx.evidence.findFirst({ where: { id: targetId, userId: ctx.userId } }),
      );
      const verification =
        verified === undefined || verified === existing.verified
          ? {}
          : { verified, verifiedAt: verified ? new Date() : null };
      const updated = await tx.evidence.update({
        where: { id: existing.id },
        data: { ...input, ...verification, importRecordId },
      });
      await auditInTx(tx, ctx, {
        entity: "evidence",
        verb: "updated",
        entityId: existing.id,
        before: toEvidenceDto(existing),
        after: toEvidenceDto(updated),
      });
      return { entityId: existing.id, notes: [] };
    },
  },

  experience: {
    async create({ tx, ctx, importRecordId, entity, relations }) {
      const input = entity as CreateExperienceInput;
      const experience = await tx.experience.create({
        data: {
          ...input,
          achievements: input.achievements ?? [],
          userId: ctx.userId,
          ...provenance(importRecordId),
        },
      });
      const titles = (relations.evidence as string[] | undefined) ?? [];
      const { found, missing } = await resolveEvidence(tx, ctx.userId, titles);
      if (found.size) {
        await tx.experienceEvidence.createMany({
          data: [...new Set(found.values())].map((evidenceId) => ({
            userId: ctx.userId,
            experienceId: experience.id,
            evidenceId,
          })),
        });
      }
      await auditInTx(tx, ctx, {
        entity: "experience",
        verb: "created",
        entityId: experience.id,
        after: toExperienceDto(experience),
      });
      return { entityId: experience.id, notes: note("evidence", missing) };
    },
    async update({ tx, ctx, importRecordId, entity, targetId }) {
      const input = entity as CreateExperienceInput;
      const existing = await ownedOrThrow(
        tx.experience.findFirst({ where: { id: targetId, userId: ctx.userId } }),
      );
      const updated = await tx.experience.update({
        where: { id: existing.id },
        data: { ...input, importRecordId },
      });
      await auditInTx(tx, ctx, {
        entity: "experience",
        verb: "updated",
        entityId: existing.id,
        before: toExperienceDto(existing),
        after: toExperienceDto(updated),
      });
      return { entityId: existing.id, notes: [] };
    },
  },

  education: {
    async create({ tx, ctx, importRecordId, entity }) {
      const input = entity as CreateEducationInput;
      const education = await tx.education.create({
        data: {
          ...input,
          achievements: input.achievements ?? [],
          userId: ctx.userId,
          ...provenance(importRecordId),
        },
      });
      await auditInTx(tx, ctx, {
        entity: "education",
        verb: "created",
        entityId: education.id,
        after: toEducationDto(education),
      });
      return { entityId: education.id, notes: [] };
    },
    async update({ tx, ctx, importRecordId, entity, targetId }) {
      const input = entity as CreateEducationInput;
      const existing = await ownedOrThrow(
        tx.education.findFirst({ where: { id: targetId, userId: ctx.userId } }),
      );
      const updated = await tx.education.update({
        where: { id: existing.id },
        data: { ...input, importRecordId },
      });
      await auditInTx(tx, ctx, {
        entity: "education",
        verb: "updated",
        entityId: existing.id,
        before: toEducationDto(existing),
        after: toEducationDto(updated),
      });
      return { entityId: existing.id, notes: [] };
    },
  },

  certification: {
    async create({ tx, ctx, importRecordId, entity, relations }) {
      const input = entity as CreateCertificationInput;
      const certification = await tx.certification.create({
        data: { ...input, userId: ctx.userId, ...provenance(importRecordId) },
      });
      const skills = await resolveByKey(
        tx,
        "skill",
        ctx.userId,
        (relations.skills as string[] | undefined) ?? [],
      );
      const evidence = await resolveEvidence(
        tx,
        ctx.userId,
        (relations.evidence as string[] | undefined) ?? [],
      );
      if (skills.found.size) {
        await tx.certificationSkill.createMany({
          data: [...new Set(skills.found.values())].map((skillId) => ({
            userId: ctx.userId,
            certificationId: certification.id,
            skillId,
          })),
        });
      }
      if (evidence.found.size) {
        await tx.certificationEvidence.createMany({
          data: [...new Set(evidence.found.values())].map((evidenceId) => ({
            userId: ctx.userId,
            certificationId: certification.id,
            evidenceId,
          })),
        });
      }
      await auditInTx(tx, ctx, {
        entity: "certification",
        verb: "created",
        entityId: certification.id,
        after: certificationSnapshot(certification),
      });
      return {
        entityId: certification.id,
        notes: [...note("skill", skills.missing), ...note("evidence", evidence.missing)],
      };
    },
    async update({ tx, ctx, importRecordId, entity, targetId }) {
      const input = entity as CreateCertificationInput;
      const existing = await ownedOrThrow(
        tx.certification.findFirst({ where: { id: targetId, userId: ctx.userId } }),
      );
      const updated = await tx.certification.update({
        where: { id: existing.id },
        data: { ...input, importRecordId },
      });
      await auditInTx(tx, ctx, {
        entity: "certification",
        verb: "updated",
        entityId: existing.id,
        before: certificationSnapshot(existing),
        after: certificationSnapshot(updated),
      });
      return { entityId: existing.id, notes: [] };
    },
  },

  project: {
    async create({ tx, ctx, importRecordId, entity, relations }) {
      const {
        skillIds: _s,
        technologies: _t,
        evidenceIds: _e,
        slug: requested,
        ...input
      } = entity as CreateProjectInput;
      const slug = await uniqueSlug(tx, ctx.userId, requested ?? slugify(input.name));
      const project = await tx.project.create({
        data: { ...input, slug, userId: ctx.userId, ...provenance(importRecordId) },
      });

      const skillNames = (relations.skills as string[] | undefined) ?? [];
      const techItems =
        (relations.technologies as
          { name: string; usageType?: string; proficiencyEvidence?: string }[] | undefined) ?? [];
      const skills = await resolveByKey(tx, "skill", ctx.userId, skillNames);
      const techs = await resolveByKey(
        tx,
        "technology",
        ctx.userId,
        techItems.map((t) => t.name),
      );
      const evidence = await resolveEvidence(
        tx,
        ctx.userId,
        (relations.evidence as string[] | undefined) ?? [],
      );

      if (skills.found.size) {
        await tx.projectSkill.createMany({
          data: [...new Set(skills.found.values())].map((skillId) => ({
            userId: ctx.userId,
            projectId: project.id,
            skillId,
          })),
        });
      }
      const usages = new Map<string, (typeof techItems)[number]>();
      for (const item of techItems) {
        const technologyId = techs.found.get(normalizeKey(item.name));
        if (technologyId && !usages.has(technologyId)) usages.set(technologyId, item);
      }
      if (usages.size) {
        await tx.technologyUsage.createMany({
          data: [...usages].map(([technologyId, item]) => ({
            userId: ctx.userId,
            projectId: project.id,
            technologyId,
            usageType: (item.usageType as "core" | undefined) ?? "core",
            proficiencyEvidence: item.proficiencyEvidence ?? null,
          })),
        });
      }
      if (evidence.found.size) {
        await tx.projectEvidence.createMany({
          data: [...new Set(evidence.found.values())].map((evidenceId) => ({
            userId: ctx.userId,
            projectId: project.id,
            evidenceId,
          })),
        });
      }
      await auditInTx(tx, ctx, {
        entity: "project",
        verb: "created",
        entityId: project.id,
        after: projectSnapshot(project),
      });
      const notes = [
        ...(requested && requested !== slug
          ? [`Slug "${requested}" was taken; used "${slug}"`]
          : []),
        ...note("skill", skills.missing),
        ...note("technology", techs.missing),
        ...note("evidence", evidence.missing),
      ];
      return { entityId: project.id, notes };
    },
    async update({ tx, ctx, importRecordId, entity, targetId }) {
      const {
        skillIds: _s,
        technologies: _t,
        evidenceIds: _e,
        slug,
        ...input
      } = entity as CreateProjectInput;
      const existing = await ownedOrThrow(
        tx.project.findFirst({ where: { id: targetId, userId: ctx.userId } }),
      );
      const data: Record<string, unknown> = { ...input, importRecordId };
      if (slug && slug !== existing.slug) {
        if (await tx.project.count({ where: { userId: ctx.userId, slug } })) {
          throw new AppError("CONFLICT", { message: "Another project already uses this slug." });
        }
        data.slug = slug;
      }
      const updated = await tx.project.update({ where: { id: existing.id }, data });
      await auditInTx(tx, ctx, {
        entity: "project",
        verb: "updated",
        entityId: existing.id,
        before: projectSnapshot(existing),
        after: projectSnapshot(updated),
      });
      return { entityId: existing.id, notes: [] };
    },
  },
};

async function linkSkillEvidence(
  tx: Tx,
  userId: string,
  skillId: string,
  relations: Record<string, unknown>,
) {
  const items =
    (relations.evidence as { title: string; strength?: string; date?: string }[] | undefined) ?? [];
  const { found, missing } = await resolveEvidence(
    tx,
    userId,
    items.map((i) => i.title),
  );
  const seen = new Set<string>();
  const data = items.flatMap((item) => {
    const evidenceId = found.get(normalizeKey(item.title));
    if (!evidenceId || seen.has(evidenceId)) return [];
    seen.add(evidenceId);
    return [
      {
        userId,
        skillId,
        evidenceId,
        strength: (item.strength as "moderate" | undefined) ?? "moderate",
        date: item.date ? new Date(`${item.date}T00:00:00.000Z`) : null,
      },
    ];
  });
  if (data.length) await tx.skillEvidence.createMany({ data });
  return note("evidence", missing);
}

async function persistProfile({ tx, ctx, importRecordId, entity }: Args): Promise<PersistResult> {
  const { name, timezone, locale, ...profileFields } = entity as UpdateProfileInput;
  const userFields = Object.fromEntries(
    Object.entries({ name, timezone, locale }).filter(([, v]) => v !== undefined),
  );
  const before = await tx.profile.findUnique({ where: { userId: ctx.userId } });
  if (Object.keys(userFields).length)
    await tx.user.update({ where: { id: ctx.userId }, data: userFields });
  const profile = await tx.profile.upsert({
    where: { userId: ctx.userId },
    create: { ...profileFields, userId: ctx.userId, ...provenance(importRecordId) },
    update: { ...profileFields, importRecordId },
  });
  await auditInTx(tx, ctx, {
    entity: "profile",
    verb: before ? "updated" : "created",
    entityId: profile.id,
    before: before ?? undefined,
    after: { ...profile, ...userFields },
  });
  return { entityId: profile.id, notes: [] };
}

export function persistCandidate(
  entityType: ImportEntityType,
  decision: "create" | "update",
  args: Args & { targetId: string | null },
): Promise<PersistResult> {
  const persister = persisters[entityType];
  if (decision === "update") {
    if (!args.targetId)
      throw new AppError("VALIDATION_FAILED", {
        message: "Nothing to update: no matching record.",
      });
    return persister.update({ ...args, targetId: args.targetId });
  }
  return persister.create(args);
}
