import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { IntegrationProvider, IntegrationStatus } from "@/generated/prisma/enums";

/**
 * Persistence + DTO mapping for the integration platform (Phase 9.5). Every query is owner-scoped.
 * DTOs NEVER include tokens or encrypted material — those stay server-side (ADR 0052).
 */

export interface ConnectionDto {
  id: string;
  provider: IntegrationProvider;
  displayName: string;
  accountEmail: string | null;
  accountLogin: string | null;
  status: IntegrationStatus;
  scopes: string[];
  capabilities: string[];
  tokenExpiresAt: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  lastAttemptedSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

type ConnectionRow = Prisma.IntegrationConnectionGetPayload<object>;

export function toConnectionDto(row: ConnectionRow): ConnectionDto {
  return {
    id: row.id,
    provider: row.provider,
    displayName: row.displayName,
    accountEmail: row.accountEmail,
    accountLogin: row.accountLogin,
    status: row.status,
    scopes: row.scopes,
    capabilities: row.capabilities,
    tokenExpiresAt: row.tokenExpiresAt?.toISOString() ?? null,
    connectedAt: row.connectedAt?.toISOString() ?? null,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastAttemptedSyncAt: row.lastAttemptedSyncAt?.toISOString() ?? null,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const integrationRepository = {
  list(db: PrismaClient, userId: string): Promise<ConnectionRow[]> {
    return db.integrationConnection.findMany({
      where: { userId },
      orderBy: [{ provider: "asc" }, { createdAt: "asc" }],
    });
  },

  findOwned(
    db: PrismaClient | Prisma.TransactionClient,
    userId: string,
    id: string,
  ): Promise<ConnectionRow | null> {
    return db.integrationConnection.findFirst({ where: { id, userId } });
  },

  /** An active connection for a provider (used to make authorized provider calls). */
  findActiveByProvider(
    db: PrismaClient,
    userId: string,
    provider: IntegrationProvider,
  ): Promise<ConnectionRow | null> {
    return db.integrationConnection.findFirst({
      where: { userId, provider, status: { in: ["connected", "degraded"] } },
      orderBy: { connectedAt: "desc" },
    });
  },

  findByAccount(
    db: PrismaClient | Prisma.TransactionClient,
    userId: string,
    provider: IntegrationProvider,
    externalAccountId: string,
  ): Promise<ConnectionRow | null> {
    return db.integrationConnection.findFirst({
      where: { userId, provider, externalAccountId },
    });
  },
};

/** A connection snapshot for audit — never includes tokens. */
export function connectionAuditSnapshot(row: ConnectionRow) {
  return {
    id: row.id,
    provider: row.provider,
    accountLogin: row.accountLogin,
    status: row.status,
    scopes: row.scopes,
  };
}
