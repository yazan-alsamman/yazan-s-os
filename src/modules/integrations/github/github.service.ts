import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors/app-error";
import { auditInTx } from "@/modules/shared/audit";
import { requireFound } from "@/modules/shared/ownership-checks";
import type { ServiceContext } from "@/modules/shared/service-context";

import { decryptSecret } from "../crypto";
import { integrationRepository as repo } from "../integration.repository";
import type { IntegrationDeps } from "../integration.service";

import { createGitHubClient, type GitHubClient } from "./github.client";
import { normalizeCommit, normalizeEvent, normalizeRepo, type RepoDto } from "./github.normalize";

/**
 * GitHub read service (Phase 9.5). Requires an active owner-scoped GitHub connection; decrypts the
 * token server-side only; normalizes untrusted payloads; caches repository metadata as external
 * resources (for linking + freshness) and reflects provider failures in connection health. GitHub
 * remains the source of truth — PEOS never copies full repositories.
 */
const REPO = "repository";

export function createGitHubService(db: PrismaClient, deps: IntegrationDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());

  async function connect(ctx: ServiceContext): Promise<{ connId: string; client: GitHubClient }> {
    const conn = await repo.findActiveByProvider(db, ctx.userId, "github");
    if (!conn || !conn.accessTokenEnc) throw new AppError("INTEGRATION_NOT_CONNECTED");
    return {
      connId: conn.id,
      client: createGitHubClient(decryptSecret(conn.accessTokenEnc), fetchImpl),
    };
  }

  /** Run a provider call; reflect auth/rate-limit failures in connection health, then rethrow. */
  async function guard<T>(connId: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof AppError) {
        if (error.code === "INTEGRATION_AUTH_FAILED") {
          await db.integrationConnection.update({
            where: { id: connId },
            data: { status: "expired", lastError: "The GitHub token is no longer valid." },
          });
        } else if (error.code === "INTEGRATION_RATE_LIMITED") {
          await db.integrationConnection.update({
            where: { id: connId },
            data: { status: "degraded", lastError: "GitHub is rate-limiting requests." },
          });
        }
      }
      throw error;
    }
  }

  async function cacheRepos(ctx: ServiceContext, connId: string, repos: RepoDto[]) {
    const at = now();
    for (const r of repos) {
      const metadata = { ...r, provenance: undefined } as unknown as Prisma.InputJsonValue;
      await db.integrationExternalResource.upsert({
        where: {
          userId_provider_resourceType_externalId: {
            userId: ctx.userId,
            provider: "github",
            resourceType: REPO,
            externalId: r.externalId,
          },
        },
        create: {
          userId: ctx.userId,
          connectionId: connId,
          provider: "github",
          resourceType: REPO,
          externalId: r.externalId,
          displayName: r.fullName,
          url: r.url,
          metadata,
          observedAt: at,
          lastSyncedAt: at,
        },
        update: { displayName: r.fullName, url: r.url, metadata, lastSyncedAt: at },
      });
    }
  }

  async function cachedRepo(ctx: ServiceContext, externalId: string) {
    const row = await db.integrationExternalResource.findFirst({
      where: { userId: ctx.userId, provider: "github", resourceType: REPO, externalId },
    });
    if (!row) throw new AppError("EXTERNAL_RESOURCE_NOT_FOUND");
    const meta = row.metadata as { fullName?: string };
    if (!meta.fullName) throw new AppError("EXTERNAL_RESOURCE_NOT_FOUND");
    return { row, fullName: meta.fullName };
  }

  return {
    async listRepositories(
      ctx: ServiceContext,
      query: {
        page: number;
        perPage: number;
        q?: string;
        sort?: "updated" | "pushed" | "full_name" | "created";
        visibility?: "all" | "public" | "private";
        archived?: boolean;
        fork?: boolean;
      },
    ) {
      const { connId, client } = await connect(ctx);
      const at = now();
      const result = await guard(connId, () =>
        client.listRepositories({
          page: query.page,
          perPage: query.perPage,
          sort: query.sort,
          visibility: query.visibility,
        }),
      );
      let repos = result.items.map((r) => normalizeRepo(r, at));
      await cacheRepos(ctx, connId, repos);
      await db.integrationConnection.update({
        where: { id: connId },
        data: { lastSyncAt: at, lastAttemptedSyncAt: at, status: "connected", lastError: null },
      });
      // Page-level filters (GitHub /user/repos has no text query): applied to the fetched page.
      if (query.q) {
        const q = query.q.toLowerCase();
        repos = repos.filter(
          (r) =>
            r.fullName.toLowerCase().includes(q) || (r.description ?? "").toLowerCase().includes(q),
        );
      }
      if (query.archived !== undefined) repos = repos.filter((r) => r.archived === query.archived);
      if (query.fork !== undefined) repos = repos.filter((r) => r.fork === query.fork);
      return {
        data: repos,
        page: { page: query.page, perPage: query.perPage, hasNextPage: result.hasNextPage },
        fetchedAt: at.toISOString(),
        filteredWithinPage: Boolean(
          query.q || query.archived !== undefined || query.fork !== undefined,
        ),
      };
    },

    async getRepository(ctx: ServiceContext, externalId: string) {
      const { connId, client } = await connect(ctx);
      const { fullName } = await cachedRepo(ctx, externalId);
      const at = now();
      const raw = await guard(connId, () => client.getRepository(fullName));
      const dto = normalizeRepo(raw, at);
      await cacheRepos(ctx, connId, [dto]);
      const links = await db.integrationResourceLink.findMany({
        where: { userId: ctx.userId, resource: { externalId, provider: "github" } },
        select: { id: true, projectId: true, project: { select: { name: true } } },
      });
      return {
        repository: dto,
        links: links.map((l) => ({
          linkId: l.id,
          projectId: l.projectId,
          projectName: l.project.name,
        })),
      };
    },

    async listCommits(
      ctx: ServiceContext,
      externalId: string,
      query: { page: number; perPage: number; sha?: string; since?: string; until?: string },
    ) {
      const { connId, client } = await connect(ctx);
      const { fullName } = await cachedRepo(ctx, externalId);
      const at = now();
      const result = await guard(connId, () => client.listCommits(fullName, query));
      return {
        data: result.items.map((c) => normalizeCommit(fullName, c, at)),
        page: { page: query.page, perPage: query.perPage, hasNextPage: result.hasNextPage },
        fetchedAt: at.toISOString(),
      };
    },

    async listActivity(
      ctx: ServiceContext,
      externalId: string,
      query: { page: number; perPage: number },
    ) {
      const { connId, client } = await connect(ctx);
      const { fullName } = await cachedRepo(ctx, externalId);
      const at = now();
      const result = await guard(connId, () => client.listRepoEvents(fullName, query));
      return {
        data: result.items.map((e) => normalizeEvent(fullName, e, at)),
        page: { page: query.page, perPage: query.perPage, hasNextPage: result.hasNextPage },
        fetchedAt: at.toISOString(),
      };
    },

    /** Explicitly link a cached GitHub repository to a PEOS project (owner-scoped, audited). */
    async linkProject(ctx: ServiceContext, externalId: string, projectId: string) {
      return db.$transaction(async (tx) => {
        const resource = requireFound(
          await tx.integrationExternalResource.findFirst({
            where: { userId: ctx.userId, provider: "github", resourceType: REPO, externalId },
          }),
        );
        requireFound(await tx.project.findFirst({ where: { id: projectId, userId: ctx.userId } }));
        const existing = await tx.integrationResourceLink.findFirst({
          where: { userId: ctx.userId, resourceId: resource.id, projectId },
        });
        if (existing)
          throw new AppError("CONFLICT", { message: "This repository is already linked." });
        const link = await tx.integrationResourceLink.create({
          data: { userId: ctx.userId, resourceId: resource.id, projectId },
        });
        await auditInTx(tx, ctx, {
          entity: "integration_resource_link",
          verb: "linked",
          entityId: link.id,
          after: { resourceId: resource.id, externalId, projectId },
        });
        return { linkId: link.id, projectId, externalId };
      });
    },

    /** Synchronize the repository cache, recording explicit sync state (idempotent, bounded). */
    async sync(ctx: ServiceContext) {
      const { connId, client } = await connect(ctx);
      const started = now();
      await db.integrationSyncState.upsert({
        where: { connectionId_resourceType: { connectionId: connId, resourceType: REPO } },
        create: {
          userId: ctx.userId,
          connectionId: connId,
          resourceType: REPO,
          status: "running",
          startedAt: started,
        },
        update: { status: "running", startedAt: started, completedAt: null, lastError: null },
      });
      await db.integrationConnection.update({
        where: { id: connId },
        data: { lastAttemptedSyncAt: started },
      });
      try {
        const result = await guard(connId, () =>
          client.listRepositories({ page: 1, perPage: 50, sort: "updated", visibility: "all" }),
        );
        const repos = result.items.map((r) => normalizeRepo(r, started));
        await cacheRepos(ctx, connId, repos);
        const completed = now();
        await db.$transaction(async (tx) => {
          await tx.integrationSyncState.update({
            where: { connectionId_resourceType: { connectionId: connId, resourceType: REPO } },
            data: {
              status: "success",
              completedAt: completed,
              recordsFetched: repos.length,
              recordsUpdated: repos.length,
              recordsFailed: 0,
              lastError: null,
            },
          });
          await tx.integrationConnection.update({
            where: { id: connId },
            data: { lastSyncAt: completed, status: "connected", lastError: null },
          });
          await auditInTx(tx, ctx, {
            entity: "integration_connection",
            verb: "sync_completed",
            entityId: connId,
            after: { resourceType: REPO, recordsFetched: repos.length },
          });
        });
        return { resourceType: REPO, recordsFetched: repos.length, status: "success" as const };
      } catch (error) {
        const message = error instanceof AppError ? error.message : "Sync failed.";
        await db.integrationSyncState.update({
          where: { connectionId_resourceType: { connectionId: connId, resourceType: REPO } },
          data: { status: "failed", completedAt: now(), lastError: message },
        });
        await db.auditLog.create({
          data: {
            actorId: ctx.userId,
            action: "integration_connection.sync_failed",
            entityType: "integration_connection",
            entityId: connId,
            requestId: ctx.requestId,
          },
        });
        throw error;
      }
    },

    async unlinkProject(ctx: ServiceContext, externalId: string, projectId: string) {
      return db.$transaction(async (tx) => {
        const resource = requireFound(
          await tx.integrationExternalResource.findFirst({
            where: { userId: ctx.userId, provider: "github", resourceType: REPO, externalId },
          }),
        );
        const link = requireFound(
          await tx.integrationResourceLink.findFirst({
            where: { userId: ctx.userId, resourceId: resource.id, projectId },
          }),
        );
        await tx.integrationResourceLink.delete({ where: { id: link.id } });
        await auditInTx(tx, ctx, {
          entity: "integration_resource_link",
          verb: "unlinked",
          entityId: link.id,
          before: { resourceId: resource.id, externalId, projectId },
        });
      });
    },
  };
}
