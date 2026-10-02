import type { Prisma, PrismaClient } from "@/generated/prisma/client";

export interface AuditEntryInput {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  requestId?: string | null;
}

/**
 * Data access for the append-only audit log. Reads are always scoped to an actor:
 * there is deliberately no unscoped "find by id" method.
 */
export function createAuditRepository(db: PrismaClient) {
  return {
    append(entry: AuditEntryInput) {
      return db.auditLog.create({
        data: {
          actorId: entry.actorId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          before: entry.before,
          after: entry.after,
          requestId: entry.requestId ?? null,
        },
      });
    },

    findForActor(actorId: string, id: string) {
      return db.auditLog.findFirst({ where: { id, actorId } });
    },

    listForActor(actorId: string, options: { limit: number }) {
      return db.auditLog.findMany({
        where: { actorId },
        orderBy: { createdAt: "desc" },
        take: options.limit,
      });
    },
  };
}

export type AuditRepository = ReturnType<typeof createAuditRepository>;
