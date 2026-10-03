import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import type { IntegrationProvider } from "@/generated/prisma/enums";
import { getServerEnv } from "@/lib/config/env";
import { AppError } from "@/lib/errors/app-error";
import { auditInTx, type Tx } from "@/modules/shared/audit";
import { requireFound } from "@/modules/shared/ownership-checks";
import type { ServiceContext } from "@/modules/shared/service-context";

import { providerClient, isProviderConfigured } from "./config";
import { decryptSecret, encryptSecret } from "./crypto";
import { createGitHubClient } from "./github/github.client";
import {
  connectionAuditSnapshot,
  integrationRepository as repo,
  toConnectionDto,
} from "./integration.repository";
import { buildAuthorizeUrl, exchangeCodeForToken } from "./oauth";
import { createState, verifyState } from "./oauth-state";
import { getProviderDefinition, PROVIDER_LIST } from "./providers";

export interface IntegrationDeps {
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

interface Identity {
  externalAccountId: string;
  displayName: string;
  accountLogin: string | null;
  accountEmail: string | null;
}

export function createIntegrationService(db: PrismaClient, deps: IntegrationDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());
  const secret = () => getServerEnv().BETTER_AUTH_SECRET;

  async function fetchIdentity(
    provider: IntegrationProvider,
    accessToken: string,
  ): Promise<Identity> {
    if (provider === "github") {
      const u = await createGitHubClient(accessToken, fetchImpl).getAuthenticatedUser();
      return {
        externalAccountId: String(u.id),
        displayName: u.name ?? u.login,
        accountLogin: u.login,
        accountEmail: u.email,
      };
    }
    // Google (and future OIDC providers): the OpenID userinfo endpoint.
    const def = getProviderDefinition(provider)!;
    let response: Response;
    try {
      response = await fetchImpl(def.identityEndpoint, {
        headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      });
    } catch {
      throw new AppError("INTEGRATION_PROVIDER_UNAVAILABLE");
    }
    if (!response.ok) throw new AppError("INTEGRATION_AUTH_FAILED");
    const info = (await response.json()) as { sub?: string; email?: string; name?: string };
    if (!info.sub) throw new AppError("INTEGRATION_AUTH_FAILED");
    return {
      externalAccountId: info.sub,
      displayName: info.name ?? info.email ?? info.sub,
      accountLogin: null,
      accountEmail: info.email ?? null,
    };
  }

  return {
    async listConnections(ctx: ServiceContext) {
      const rows = await repo.list(db, ctx.userId);
      return rows.map(toConnectionDto);
    },

    async getConnection(ctx: ServiceContext, id: string) {
      return toConnectionDto(requireFound(await repo.findOwned(db, ctx.userId, id)));
    },

    /** The registry with per-provider configuration and the owner's current connection. */
    async listProviders(ctx: ServiceContext) {
      const rows = await repo.list(db, ctx.userId);
      const byProvider = new Map(rows.map((r) => [r.provider, r]));
      return PROVIDER_LIST.map((def) => {
        const row = byProvider.get(def.provider);
        return {
          provider: def.provider,
          displayName: def.displayName,
          status: def.status,
          configured: isProviderConfigured(def.provider),
          scopes: def.scopes,
          resources: def.resources,
          mutations: def.mutations,
          connection: row ? toConnectionDto(row) : null,
        };
      });
    },

    /** Begin the OAuth flow: returns a provider authorize URL carrying a signed state. */
    async startConnect(ctx: ServiceContext, provider: IntegrationProvider) {
      const def = getProviderDefinition(provider);
      if (!def) throw new AppError("NOT_FOUND");
      const client = providerClient(provider);
      if (!client) throw new AppError("INTEGRATION_NOT_CONFIGURED");
      const state = createState(secret(), { userId: ctx.userId, provider });
      const authorizeUrl = buildAuthorizeUrl(
        provider,
        client,
        state,
        def.scopes.map((s) => s.scope),
      );
      return { provider, authorizeUrl };
    },

    /** Handle the provider callback: validate state, exchange code, store the connection. */
    async handleCallback(
      ctx: ServiceContext,
      provider: IntegrationProvider,
      input: { code: string; state: string },
    ) {
      const def = getProviderDefinition(provider);
      if (!def) throw new AppError("NOT_FOUND");
      const client = providerClient(provider);
      if (!client) throw new AppError("INTEGRATION_NOT_CONFIGURED");
      if (!verifyState(secret(), input.state, { userId: ctx.userId, provider })) {
        throw new AppError("INTEGRATION_AUTH_FAILED", { message: "OAuth state is invalid." });
      }
      const token = await exchangeCodeForToken(provider, client, input.code, fetchImpl);
      const identity = await fetchIdentity(provider, token.accessToken);
      const at = now();
      const expiresAt = token.expiresInSeconds
        ? new Date(at.getTime() + token.expiresInSeconds * 1000)
        : null;
      const data = {
        displayName: identity.displayName,
        accountEmail: identity.accountEmail,
        accountLogin: identity.accountLogin,
        status: "connected" as const,
        accessTokenEnc: encryptSecret(token.accessToken),
        refreshTokenEnc: token.refreshToken ? encryptSecret(token.refreshToken) : null,
        tokenExpiresAt: expiresAt,
        scopes: token.scope.length ? token.scope : def.scopes.map((s) => s.scope),
        capabilities: def.resources,
        connectedAt: at,
        lastError: null,
      };

      const connectionId = await db.$transaction(async (tx) => {
        const existing = await repo.findByAccount(
          tx,
          ctx.userId,
          provider,
          identity.externalAccountId,
        );
        const row = existing
          ? await tx.integrationConnection.update({ where: { id: existing.id }, data })
          : await tx.integrationConnection.create({
              data: {
                userId: ctx.userId,
                provider,
                externalAccountId: identity.externalAccountId,
                ...data,
              },
            });
        await auditInTx(tx, ctx, {
          entity: "integration_connection",
          verb: existing ? "reauthorized" : "connected",
          entityId: row.id,
          after: connectionAuditSnapshot(row),
        });
        return row.id;
      });
      return { connectionId, provider };
    },

    /** Re-validate a connection's token (and refresh it where the provider supports refresh). */
    async refresh(ctx: ServiceContext, id: string) {
      const conn = requireFound(await repo.findOwned(db, ctx.userId, id));
      if (conn.status === "disconnected" || conn.status === "revoked" || !conn.accessTokenEnc) {
        throw new AppError("INTEGRATION_NOT_CONNECTED");
      }
      try {
        const identity = await fetchIdentity(conn.provider, decryptSecret(conn.accessTokenEnc));
        void identity;
      } catch (error) {
        if (error instanceof AppError && error.code === "INTEGRATION_AUTH_FAILED") {
          await db.integrationConnection.update({
            where: { id: conn.id },
            data: { status: "expired", lastError: "The provider token is no longer valid." },
          });
          throw new AppError("INTEGRATION_NOT_CONNECTED", {
            message: "The connection has expired; reconnect the provider.",
          });
        }
        throw error;
      }
      await db.$transaction(async (tx) => {
        const row = await tx.integrationConnection.update({
          where: { id: conn.id },
          data: { status: "connected", lastError: null },
        });
        await auditInTx(tx, ctx, {
          entity: "integration_connection",
          verb: "reauthorized",
          entityId: row.id,
          after: connectionAuditSnapshot(row),
        });
      });
      return this.getConnection(ctx, id);
    },

    /** Disconnect: stop syncing and securely discard stored tokens. Audit history is preserved. */
    async disconnect(ctx: ServiceContext, id: string) {
      const conn = requireFound(await repo.findOwned(db, ctx.userId, id));
      await db.$transaction(async (tx: Tx) => {
        const row = await tx.integrationConnection.update({
          where: { id: conn.id },
          data: {
            status: "disconnected",
            accessTokenEnc: null,
            refreshTokenEnc: null,
            tokenExpiresAt: null,
          },
        });
        await auditInTx(tx, ctx, {
          entity: "integration_connection",
          verb: "disconnected",
          entityId: row.id,
          before: connectionAuditSnapshot(conn),
        });
      });
    },

    async health(ctx: ServiceContext, id: string) {
      const conn = requireFound(await repo.findOwned(db, ctx.userId, id));
      const dto = toConnectionDto(conn);
      return {
        ...dto,
        healthy: conn.status === "connected",
        hasToken: Boolean(conn.accessTokenEnc),
      };
    },

    async permissions(ctx: ServiceContext, id: string) {
      const conn = requireFound(await repo.findOwned(db, ctx.userId, id));
      const def = getProviderDefinition(conn.provider)!;
      return {
        provider: conn.provider,
        granted: conn.scopes,
        requested: def.scopes,
      };
    },
  };
}
