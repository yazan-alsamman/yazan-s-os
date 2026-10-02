import type { Prisma } from "@/generated/prisma/client";

import type { ServiceContext } from "./service-context";

export type Tx = Prisma.TransactionClient;

export type AuditEntity =
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

export type AuditVerb =
  | "created"
  | "updated"
  | "deleted"
  | "relations_updated"
  | "completed"
  | "reopened"
  | "uploaded"
  | "accepted"
  | "rejected"
  | "generated";

/**
 * Write a domain audit entry inside the caller's transaction, so a mutation and its audit record
 * commit or roll back together. Snapshots must contain domain fields only — never credentials.
 */
export async function auditInTx(
  tx: Tx,
  ctx: ServiceContext,
  entry: {
    entity: AuditEntity;
    verb: AuditVerb;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: ctx.userId,
      action: `${entry.entity}.${entry.verb}`,
      entityType: entry.entity,
      entityId: entry.entityId ?? null,
      before: toJson(entry.before),
      after: toJson(entry.after),
      requestId: ctx.requestId,
    },
  });
}

/** JSON-safe snapshot: Dates become ISO strings, undefined is dropped, internal ids kept. */
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
