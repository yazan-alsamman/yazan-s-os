import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors/app-error";
import type { ServiceContext } from "@/modules/shared/service-context";

import { providerClient } from "../config";
import { decryptSecret, encryptSecret } from "../crypto";
import { integrationRepository as repo } from "../integration.repository";
import type { IntegrationDeps } from "../integration.service";

/**
 * Shared authorized Google client (Phase 9.5+). Resolves a valid access token for the active Google
 * connection, refreshing it with the stored refresh token when expired, and maps provider failures
 * to PEOS error codes + connection health. Tokens are decrypted only here (server-side). `fetchImpl`
 * is injectable for tests. Gmail/Drive/Calendar adapters are built on this.
 */
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SKEW_MS = 60_000;

export function createGoogleClient(
  db: PrismaClient,
  ctx: ServiceContext,
  deps: IntegrationDeps = {},
) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());
  let resolved: { connId: string; token: string } | null = null;

  async function markExpired(connId: string) {
    await db.integrationConnection.update({
      where: { id: connId },
      data: { status: "expired", lastError: "The Google token is no longer valid." },
    });
  }

  async function refresh(
    connId: string,
    refreshTokenEnc: string,
  ): Promise<{ token: string; expiresAt: Date | null }> {
    const client = providerClient("google");
    if (!client) throw new AppError("INTEGRATION_NOT_CONFIGURED");
    const body = new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: decryptSecret(refreshTokenEnc),
      grant_type: "refresh_token",
    });
    let response: Response;
    try {
      response = await fetchImpl(TOKEN_ENDPOINT, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });
    } catch {
      throw new AppError("INTEGRATION_PROVIDER_UNAVAILABLE");
    }
    if (!response.ok) {
      await markExpired(connId);
      throw new AppError("INTEGRATION_NOT_CONNECTED", {
        message: "Reconnect Google (token expired).",
      });
    }
    const json = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) {
      await markExpired(connId);
      throw new AppError("INTEGRATION_NOT_CONNECTED");
    }
    const expiresAt = json.expires_in ? new Date(now().getTime() + json.expires_in * 1000) : null;
    await db.integrationConnection.update({
      where: { id: connId },
      data: {
        accessTokenEnc: encryptSecret(json.access_token),
        tokenExpiresAt: expiresAt,
        status: "connected",
        lastError: null,
      },
    });
    return { token: json.access_token, expiresAt };
  }

  async function ensure(): Promise<{ connId: string; token: string }> {
    if (resolved) return resolved;
    const conn = await repo.findActiveByProvider(db, ctx.userId, "google");
    if (!conn || !conn.accessTokenEnc) throw new AppError("INTEGRATION_NOT_CONNECTED");
    if (conn.tokenExpiresAt && conn.tokenExpiresAt.getTime() - SKEW_MS > now().getTime()) {
      resolved = { connId: conn.id, token: decryptSecret(conn.accessTokenEnc) };
      return resolved;
    }
    if (!conn.refreshTokenEnc) {
      await markExpired(conn.id);
      throw new AppError("INTEGRATION_NOT_CONNECTED", {
        message: "Reconnect Google (token expired).",
      });
    }
    const { token } = await refresh(conn.id, conn.refreshTokenEnc);
    resolved = { connId: conn.id, token };
    return resolved;
  }

  async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const { connId, token } = await ensure();
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new AppError("INTEGRATION_PROVIDER_UNAVAILABLE");
    }
    if (response.status === 401) {
      await markExpired(connId);
      throw new AppError("INTEGRATION_AUTH_FAILED");
    }
    if (response.status === 404) throw new AppError("EXTERNAL_RESOURCE_NOT_FOUND");
    if (
      response.status === 429 ||
      (response.status === 403 &&
        /rateLimitExceeded|userRateLimitExceeded/i.test(
          await response
            .clone()
            .text()
            .catch(() => ""),
        ))
    ) {
      await db.integrationConnection.update({
        where: { id: connId },
        data: { status: "degraded", lastError: "Google is rate-limiting requests." },
      });
      throw new AppError("INTEGRATION_RATE_LIMITED");
    }
    if (!response.ok) throw new AppError("INTEGRATION_PROVIDER_UNAVAILABLE");
    if (response.status === 204) return undefined as T;
    try {
      return (await response.json()) as T;
    } catch {
      throw new AppError("INTEGRATION_PROVIDER_UNAVAILABLE");
    }
  }

  return {
    connId: async () => (await ensure()).connId,
    get: <T>(url: string) => request<T>("GET", url),
    post: <T>(url: string, body: unknown) => request<T>("POST", url, body),
    patch: <T>(url: string, body: unknown) => request<T>("PATCH", url, body),
    put: <T>(url: string, body: unknown) => request<T>("PUT", url, body),
    del: <T>(url: string) => request<T>("DELETE", url),
    async touchSync() {
      const { connId } = await ensure();
      await db.integrationConnection.update({
        where: { id: connId },
        data: {
          lastSyncAt: now(),
          lastAttemptedSyncAt: now(),
          status: "connected",
          lastError: null,
        },
      });
    },
  };
}

export type GoogleClient = ReturnType<typeof createGoogleClient>;
