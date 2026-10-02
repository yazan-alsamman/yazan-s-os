import { requireResourceOwnership } from "@/lib/auth/ownership";
import type { Logger } from "@/lib/observability/logger";

import type { AuditEntryInput, AuditRepository } from "./audit.repository";

/** Audit actions recorded in Phase 0. Phase 1+ domains add their own. */
export const AuditAction = {
  UserCreated: "auth.user.created",
  SessionCreated: "auth.session.created",
  SessionRevoked: "auth.session.revoked",
} as const;

export function createAuditService(deps: { repository: AuditRepository; logger: Logger }) {
  return {
    /**
     * Record an audit event. Failures are logged but never break the user-facing action,
     * because the action itself has already succeeded.
     */
    async record(entry: AuditEntryInput): Promise<void> {
      try {
        await deps.repository.append(entry);
      } catch (error) {
        deps.logger.error(
          { err: error, action: entry.action, entityType: entry.entityType },
          "audit.write_failed",
        );
      }
    },

    /** Fetch one audit entry owned by `actorId`; other users' entries are indistinguishable from missing ones. */
    async getOwnedEntry(actorId: string, id: string) {
      const entry = await deps.repository.findForActor(actorId, id);
      return requireResourceOwnership(entry, actorId, (e) => e.actorId);
    },
  };
}

export type AuditService = ReturnType<typeof createAuditService>;
