import type { AuditLog, Prisma, PrismaClient } from "@/generated/prisma/client";
import { paginated } from "@/lib/http/pagination";
import { requireFound } from "@/modules/shared/ownership-checks";
import type { ServiceContext } from "@/modules/shared/service-context";

import { resolvePeriod, timestampWhere, toPeriodDto } from "./period";

/**
 * Recent activity (ADR 0021): a safe presentation of the caller's own audit log.
 *
 * - Source: `audit_logs` rows with actor_id = session user (in-transaction audit, Phase 1).
 * - Authentication events (`auth.*`: sign-ins, sessions, user agents) are excluded.
 * - Raw before/after snapshots are NEVER returned; only a display label is extracted from a
 *   whitelist of name/title fields per entity type.
 * - Links are emitted only when the referenced record still exists AND belongs to the caller;
 *   deleted records are marked as such.
 */
export type ActivityEntity =
  | "profile"
  | "experience"
  | "education"
  | "skill"
  | "technology"
  | "certification"
  | "project"
  | "milestone"
  | "evidence"
  | "import_job"
  | "import_record"
  | "export";

export interface ActivityItem {
  id: string;
  at: string;
  entityType: ActivityEntity | "other";
  verb: string;
  summary: string;
  label: string | null;
  href: string | null;
  deleted: boolean;
}

const ENTITY_NOUNS: Record<ActivityEntity, string> = {
  profile: "profile",
  experience: "experience",
  education: "education entry",
  skill: "skill",
  technology: "technology",
  certification: "certification",
  project: "project",
  milestone: "milestone",
  evidence: "evidence",
  import_job: "import",
  import_record: "import record",
  export: "data export",
};

const VERB_TEXT: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  deleted: "Deleted",
  relations_updated: "Changed links of",
  completed: "Completed",
  reopened: "Reopened",
  uploaded: "Uploaded",
  accepted: "Accepted",
  rejected: "Rejected",
  generated: "Generated",
};

/** Whitelisted label fields per entity — nothing else from a snapshot is ever read. */
const LABEL_FIELDS: Partial<Record<ActivityEntity, readonly string[]>> = {
  experience: ["title", "organization"],
  education: ["institution"],
  skill: ["name"],
  technology: ["name"],
  certification: ["name"],
  project: ["name"],
  milestone: ["title"],
  evidence: ["title"],
  import_job: ["fileName"],
  import_record: ["entityType"],
  export: ["format"],
};

const MAX_LABEL = 120;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Pure transformation of one audit row (exported for unit tests). */
export function toActivityItem(
  row: Pick<
    AuditLog,
    "id" | "action" | "entityType" | "entityId" | "before" | "after" | "createdAt"
  >,
  exists: (entity: ActivityEntity, id: string) => boolean,
  jobOf: (row: Pick<AuditLog, "after">) => string | null = (r) => {
    const jobId = asRecord(r.after)?.jobId;
    return typeof jobId === "string" ? jobId : null;
  },
  /** Current display label of a record that still exists (used when the snapshot has none). */
  currentLabel: (id: string) => string | null = () => null,
): ActivityItem {
  const entity = (row.entityType in ENTITY_NOUNS ? row.entityType : "other") as
    ActivityEntity | "other";
  const verb = row.action.split(".").at(-1) ?? row.action;
  const snapshot = asRecord(row.after) ?? asRecord(row.before);
  let label: string | null = null;
  if (entity !== "other" && snapshot) {
    const fields = LABEL_FIELDS[entity] ?? [];
    const parts = fields
      .map((f) => snapshot[f])
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    if (parts.length) label = parts.join(" · ").slice(0, MAX_LABEL);
  }
  // Relation-only changes ("relations_updated") snapshot link ids, not names.
  if (!label && row.entityId) label = currentLabel(row.entityId)?.slice(0, MAX_LABEL) ?? null;

  let href: string | null = null;
  let deleted = false;
  const id = row.entityId;
  switch (entity) {
    case "profile":
      href = "/career/profile";
      break;
    case "education":
      href = id && exists("education", id) ? "/career/education" : null;
      deleted = Boolean(id) && !href;
      break;
    case "export":
      href = "/settings/export";
      break;
    case "import_job":
      href = id && exists("import_job", id) ? `/settings/import/${id}` : null;
      break;
    case "import_record": {
      const jobId = jobOf(row);
      href = jobId && exists("import_job", jobId) ? `/settings/import/${jobId}` : null;
      break;
    }
    case "milestone": {
      // A milestone never moves between projects, so the snapshot projectId is authoritative.
      const projectId = snapshot?.projectId;
      if (id && exists("milestone", id) && typeof projectId === "string") {
        href = `/projects/${projectId}#milestones`;
      } else deleted = Boolean(id);
      break;
    }
    case "other":
      break;
    default: {
      const paths: Record<string, string> = {
        experience: "/career/experience/",
        skill: "/skills/",
        technology: "/skills/technologies/",
        certification: "/certifications/",
        project: "/projects/",
        evidence: "/evidence/",
      };
      if (id && exists(entity, id)) href = `${paths[entity]}${id}`;
      else deleted = Boolean(id);
    }
  }

  const noun = entity === "other" ? "record" : ENTITY_NOUNS[entity];
  const verbText = VERB_TEXT[verb] ?? verb.replace(/_/g, " ");
  return {
    id: row.id,
    at: row.createdAt.toISOString(),
    entityType: entity,
    verb,
    summary: `${verbText} ${noun}`,
    label,
    href,
    deleted,
  };
}

const AUDIT_SELECT = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  before: true,
  after: true,
  createdAt: true,
} as const;

type AuditRow = Pick<
  AuditLog,
  "id" | "action" | "entityType" | "entityId" | "before" | "after" | "createdAt"
>;

/**
 * Turn audit rows into safe DTOs: existence checks and current labels are batched per entity type
 * and owner-scoped (one query per type present on the page). Snapshots never leave this function.
 */
async function present(db: PrismaClient, userId: string, rows: AuditRow[]) {
  const idsOf = (type: string) => [
    ...new Set(rows.filter((r) => r.entityType === type && r.entityId).map((r) => r.entityId!)),
  ];
  const jobIds = [
    ...new Set([
      ...idsOf("import_job"),
      ...rows
        .filter((r) => r.entityType === "import_record")
        .map((r) => asRecord(r.after)?.jobId)
        .filter((v): v is string => typeof v === "string"),
    ]),
  ];
  const lookups = await Promise.all([
    db.experience.findMany({
      where: { userId, id: { in: idsOf("experience") } },
      select: { id: true, title: true },
    }),
    db.education.findMany({
      where: { userId, id: { in: idsOf("education") } },
      select: { id: true },
    }),
    db.skill.findMany({
      where: { userId, id: { in: idsOf("skill") } },
      select: { id: true, name: true },
    }),
    db.technology.findMany({
      where: { userId, id: { in: idsOf("technology") } },
      select: { id: true, name: true },
    }),
    db.certification.findMany({
      where: { userId, id: { in: idsOf("certification") } },
      select: { id: true, name: true },
    }),
    db.project.findMany({
      where: { userId, id: { in: idsOf("project") } },
      select: { id: true, name: true },
    }),
    db.evidence.findMany({
      where: { userId, id: { in: idsOf("evidence") } },
      select: { id: true, title: true },
    }),
    db.milestone.findMany({
      where: { userId, id: { in: idsOf("milestone") } },
      select: { id: true, title: true },
    }),
    db.importJob.findMany({ where: { userId, id: { in: jobIds } }, select: { id: true } }),
  ]);
  const found = lookups.flat() as { id: string; name?: string; title?: string }[];
  const existing = new Set(found.map((r) => r.id));
  const names = new Map(found.map((r) => [r.id, r.name ?? r.title ?? null]));
  return rows.map((row) =>
    toActivityItem(
      row,
      (_entity, id) => existing.has(id),
      undefined,
      (id) => names.get(id) ?? null,
    ),
  );
}

/**
 * Audit filter for one project: events on the project itself and on its milestones, matched by
 * the milestone snapshot projectId (so deleted milestones still appear). Same definition as the
 * recent-activity health component (ADR 0024).
 */
export function projectActivityWhere(userId: string, projectId: string): Prisma.AuditLogWhereInput {
  return {
    actorId: userId,
    OR: [
      { entityType: "project", entityId: projectId },
      {
        entityType: "milestone",
        OR: [
          { after: { path: ["projectId"], equals: projectId } },
          { before: { path: ["projectId"], equals: projectId } },
        ],
      },
    ],
  };
}

export function createActivityService(db: PrismaClient) {
  async function page(
    userId: string,
    where: Prisma.AuditLogWhereInput,
    query: { page: number; pageSize: number },
  ) {
    const [rows, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: AUDIT_SELECT,
      }),
      db.auditLog.count({ where }),
    ]);
    return paginated(await present(db, userId, rows), total, query);
  }

  return {
    async list(
      ctx: ServiceContext,
      query: {
        range: "30d" | "90d" | "365d" | "all" | "custom";
        from?: Date;
        to?: Date;
        page: number;
        pageSize: number;
      },
      now: Date = new Date(),
    ) {
      const period = resolvePeriod(query, now);
      const where: Prisma.AuditLogWhereInput = {
        actorId: ctx.userId,
        NOT: { action: { startsWith: "auth." } },
        ...(timestampWhere(period) ? { createdAt: timestampWhere(period) } : {}),
      };
      return { ...(await page(ctx.userId, where, query)), period: toPeriodDto(period) };
    },

    /** Project-relevant activity for the dossier; 404 when the project is not the caller's. */
    async listForProject(
      ctx: ServiceContext,
      projectId: string,
      query: { page: number; pageSize: number },
    ) {
      requireFound(
        await db.project.findFirst({
          where: { id: projectId, userId: ctx.userId },
          select: { id: true },
        }),
      );
      return page(ctx.userId, projectActivityWhere(ctx.userId, projectId), query);
    },
  };
}
