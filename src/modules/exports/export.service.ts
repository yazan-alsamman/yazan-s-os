import { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";
import { toCsv } from "@/modules/imports/csv";
import { EXCHANGE_FORMAT, EXCHANGE_VERSION } from "@/modules/imports/exchange-format";
import { auditInTx } from "@/modules/shared/audit";
import { toDateOnly } from "@/modules/shared/fields";
import { provenanceInclude, toProvenance } from "@/modules/shared/provenance";
import type { ServiceContext } from "@/modules/shared/service-context";

/**
 * Data export (07 "Privacy: export all data", 08 Phase 1 "import/export").
 * - Only the caller's records (every query is scoped by userId).
 * - JSON = PEOS exchange document: relationships by natural name, provenance included,
 *   re-importable through the review queue. CSV = one entity type per file.
 * - Deterministic ordering (createdAt, id). Nothing is stored server-side; no public URLs.
 * - No credentials, sessions, tokens or audit internals are ever exported.
 */
export const EXPORT_ENTITIES = [
  "experiences",
  "education",
  "skills",
  "technologies",
  "certifications",
  "projects",
  "evidence",
] as const;

export type ExportEntity = (typeof EXPORT_ENTITIES)[number];

export const exportQuerySchema = z
  .object({
    format: z.enum(["json", "csv"]).default("json"),
    entity: z.enum(EXPORT_ENTITIES).optional(),
  })
  .refine((q) => q.format === "json" || q.entity, {
    message: "Choose which records to export as CSV",
    path: ["entity"],
  });

const order = [{ createdAt: "asc" as const }, { id: "asc" as const }];

async function loadAll(db: PrismaClient, userId: string) {
  const where = { userId };
  const [user, experiences, education, skills, technologies, certifications, projects, evidence] =
    await Promise.all([
      db.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          name: true,
          timezone: true,
          locale: true,
          profile: { include: provenanceInclude },
        },
      }),
      db.experience.findMany({
        where,
        orderBy: order,
        include: {
          ...provenanceInclude,
          evidence: { include: { evidence: { select: { title: true } } } },
        },
      }),
      db.education.findMany({ where, orderBy: order, include: provenanceInclude }),
      db.skill.findMany({
        where,
        orderBy: order,
        include: {
          ...provenanceInclude,
          evidence: { include: { evidence: { select: { title: true } } } },
        },
      }),
      db.technology.findMany({ where, orderBy: order, include: provenanceInclude }),
      db.certification.findMany({
        where,
        orderBy: order,
        include: {
          ...provenanceInclude,
          skills: { include: { skill: { select: { name: true } } } },
          evidence: { include: { evidence: { select: { title: true } } } },
        },
      }),
      db.project.findMany({
        where,
        orderBy: order,
        include: {
          ...provenanceInclude,
          skills: { include: { skill: { select: { name: true } } } },
          technologies: { include: { technology: { select: { name: true } } } },
          evidence: { include: { evidence: { select: { title: true } } } },
        },
      }),
      db.evidence.findMany({ where, orderBy: order, include: provenanceInclude }),
    ]);
  return { user, experiences, education, skills, technologies, certifications, projects, evidence };
}

const sortedNames = (names: string[]) => [...names].sort((a, b) => a.localeCompare(b));

export function buildExchangeDocument(data: Awaited<ReturnType<typeof loadAll>>, exportedAt: Date) {
  const { user } = data;
  return {
    format: EXCHANGE_FORMAT,
    version: EXCHANGE_VERSION,
    exportedAt: exportedAt.toISOString(),
    profile: {
      name: user.name,
      timezone: user.timezone,
      locale: user.locale,
      headline: user.profile?.headline ?? null,
      summary: user.profile?.summary ?? null,
      location: user.profile?.location ?? null,
      website: user.profile?.website ?? null,
      professionalObjective: user.profile?.professionalObjective ?? null,
      provenance: user.profile ? toProvenance(user.profile) : null,
    },
    experiences: data.experiences.map((e) => ({
      id: e.id,
      organization: e.organization,
      title: e.title,
      startDate: toDateOnly(e.startDate),
      endDate: toDateOnly(e.endDate),
      description: e.description,
      achievements: e.achievements,
      evidence: sortedNames(e.evidence.map((l) => l.evidence.title)),
      provenance: toProvenance(e),
    })),
    education: data.education.map((e) => ({
      id: e.id,
      institution: e.institution,
      degree: e.degree,
      fieldOfStudy: e.fieldOfStudy,
      startDate: toDateOnly(e.startDate),
      endDate: toDateOnly(e.endDate),
      description: e.description,
      achievements: e.achievements,
      provenance: toProvenance(e),
    })),
    skills: data.skills.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      description: s.description,
      levelModel: s.levelModel,
      targetLevel: s.targetLevel,
      active: s.active,
      evidence: s.evidence
        .map((l) => ({
          title: l.evidence.title,
          strength: l.strength,
          date: toDateOnly(l.date) ?? undefined,
        }))
        .sort((a, b) => a.title.localeCompare(b.title)),
      provenance: toProvenance(s),
    })),
    technologies: data.technologies.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      version: t.version,
      notes: t.notes,
      provenance: toProvenance(t),
    })),
    certifications: data.certifications.map((c) => ({
      id: c.id,
      name: c.name,
      issuer: c.issuer,
      category: c.category,
      issueDate: toDateOnly(c.issueDate),
      expiryDate: toDateOnly(c.expiryDate),
      credentialId: c.credentialId,
      verificationUrl: c.verificationUrl,
      status: c.status,
      skills: sortedNames(c.skills.map((l) => l.skill.name)),
      evidence: sortedNames(c.evidence.map((l) => l.evidence.title)),
      provenance: toProvenance(c),
    })),
    projects: data.projects.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      problem: p.problem,
      solution: p.solution,
      impact: p.impact,
      status: p.status,
      healthStatus: p.healthStatus,
      startDate: toDateOnly(p.startDate),
      targetDate: toDateOnly(p.targetDate),
      completedAt: toDateOnly(p.completedAt),
      repositoryUrl: p.repositoryUrl,
      demoUrl: p.demoUrl,
      productionUrl: p.productionUrl,
      skills: sortedNames(p.skills.map((l) => l.skill.name)),
      technologies: p.technologies
        .map((u) => ({
          name: u.technology.name,
          usageType: u.usageType,
          proficiencyEvidence: u.proficiencyEvidence ?? undefined,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      evidence: sortedNames(p.evidence.map((l) => l.evidence.title)),
      provenance: toProvenance(p),
    })),
    evidence: data.evidence.map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      description: e.description,
      sourceUrl: e.sourceUrl,
      fileUrl: e.fileUrl,
      date: toDateOnly(e.date),
      verified: e.verified,
      provenance: toProvenance(e),
    })),
  };
}

export type ExchangeExport = ReturnType<typeof buildExchangeDocument>;

/** CSV columns per entity — the same field names the entity CSV importer reads. */
export const CSV_COLUMNS: Record<ExportEntity, readonly string[]> = {
  experiences: [
    "id",
    "organization",
    "title",
    "startDate",
    "endDate",
    "description",
    "achievements",
    "evidence",
    "origin",
  ],
  education: [
    "id",
    "institution",
    "degree",
    "fieldOfStudy",
    "startDate",
    "endDate",
    "description",
    "achievements",
    "origin",
  ],
  skills: [
    "id",
    "name",
    "category",
    "description",
    "levelModel",
    "targetLevel",
    "active",
    "evidence",
    "origin",
  ],
  technologies: ["id", "name", "category", "version", "notes", "origin"],
  certifications: [
    "id",
    "name",
    "issuer",
    "category",
    "issueDate",
    "expiryDate",
    "credentialId",
    "verificationUrl",
    "status",
    "skills",
    "evidence",
    "origin",
  ],
  projects: [
    "id",
    "name",
    "slug",
    "description",
    "problem",
    "solution",
    "impact",
    "status",
    "healthStatus",
    "startDate",
    "targetDate",
    "completedAt",
    "repositoryUrl",
    "demoUrl",
    "productionUrl",
    "skills",
    "technologies",
    "evidence",
    "origin",
  ],
  evidence: [
    "id",
    "type",
    "title",
    "description",
    "sourceUrl",
    "fileUrl",
    "date",
    "verified",
    "origin",
  ],
};

function csvRows(document: ExchangeExport, entity: ExportEntity): Record<string, unknown>[] {
  return (document[entity] as Record<string, unknown>[]).map((row) => {
    const { provenance, ...rest } = row as Record<string, unknown> & {
      provenance: { origin: string };
    };
    const out: Record<string, unknown> = { ...rest, origin: provenance.origin };
    if (entity === "skills") {
      out.evidence = (rest.evidence as { title: string }[]).map((e) => e.title);
    }
    if (entity === "projects") {
      out.technologies = (rest.technologies as { name: string; usageType: string }[]).map(
        (t) => `${t.name}:${t.usageType}`,
      );
    }
    return out;
  });
}

export function createExportService(db: PrismaClient) {
  return {
    async export(
      ctx: ServiceContext,
      query: z.infer<typeof exportQuerySchema>,
      now: Date = new Date(),
    ): Promise<{ fileName: string; contentType: string; body: string }> {
      const document = buildExchangeDocument(await loadAll(db, ctx.userId), now);
      const day = now.toISOString().slice(0, 10);
      const counts = Object.fromEntries(
        EXPORT_ENTITIES.map((e) => [e, (document[e] as unknown[]).length]),
      );
      await db.$transaction((tx) =>
        auditInTx(tx, ctx, {
          entity: "export",
          verb: "generated",
          after: { format: query.format, entity: query.entity ?? "all", counts },
        }),
      );
      if (query.format === "csv" && query.entity) {
        return {
          fileName: `peos-${query.entity}-${day}.csv`,
          contentType: "text/csv; charset=utf-8",
          body: toCsv(CSV_COLUMNS[query.entity], csvRows(document, query.entity)),
        };
      }
      return {
        fileName: `peos-export-${day}.json`,
        contentType: "application/json; charset=utf-8",
        body: `${JSON.stringify(document, null, 2)}\n`,
      };
    },
  };
}
