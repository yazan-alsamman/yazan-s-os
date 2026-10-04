import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors/app-error";
import type { ServiceContext } from "@/modules/shared/service-context";

import { decryptSecret } from "../crypto";
import { integrationRepository as repo } from "../integration.repository";
import type { IntegrationDeps } from "../integration.service";

import { createGitHubClient, type GitHubClient } from "./github.client";
import { normalizeCommit, normalizeRepo, type RepoDto } from "./github.normalize";

/**
 * GitHub synchronization (Phase 9.6, ADR 0054). Explicitly triggered (no continuous monitoring).
 * Pages all repositories into the external-resource cache, then syncs recent commits for the most
 * recently pushed repositories into the GitHubCommit projection for fast local aggregation.
 * Bounded, idempotent (upsert on unique sha), and rate-limit aware (via the client's error mapping).
 */
const MAX_REPOS = 500;
const MAX_COMMIT_REPOS = 60;
const COMMIT_PAGES = 3; // × 100 = up to 300 commits per repo
const COMMIT_WINDOW_DAYS = 365;
const REPO = "repository";

export function createGitHubSyncService(db: PrismaClient, deps: IntegrationDeps = {}) {
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

  async function cacheRepo(ctx: ServiceContext, connId: string, r: RepoDto, at: Date) {
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

  async function setSyncState(
    ctx: ServiceContext,
    connId: string,
    resourceType: string,
    data: Partial<{
      status: "running" | "success" | "partial" | "failed";
      startedAt: Date;
      completedAt: Date | null;
      recordsFetched: number;
      recordsUpdated: number;
      recordsFailed: number;
      lastError: string | null;
    }>,
  ) {
    await db.integrationSyncState.upsert({
      where: { connectionId_resourceType: { connectionId: connId, resourceType } },
      create: {
        userId: ctx.userId,
        connectionId: connId,
        resourceType,
        ...data,
        status: data.status ?? "running",
      },
      update: data,
    });
  }

  return {
    /** Full sync: repositories (all pages, bounded) + recent commits for the most active repos. */
    async sync(ctx: ServiceContext) {
      const { connId, client } = await connect(ctx);
      const started = now();
      await db.integrationConnection.update({
        where: { id: connId },
        data: { lastAttemptedSyncAt: started },
      });

      // 1) Repositories
      await setSyncState(ctx, connId, REPO, {
        status: "running",
        startedAt: started,
        completedAt: null,
        lastError: null,
      });
      let repoCount = 0;
      const repos: RepoDto[] = [];
      try {
        for (let page = 1; page <= Math.ceil(MAX_REPOS / 100); page++) {
          const res = await guard(connId, () =>
            client.listRepositories({ page, perPage: 100, sort: "pushed", visibility: "all" }),
          );
          const batch = res.items.map((r) => normalizeRepo(r, started));
          for (const r of batch) {
            await cacheRepo(ctx, connId, r, started);
            repos.push(r);
            repoCount++;
          }
          if (!res.hasNextPage || repoCount >= MAX_REPOS) break;
        }
        await setSyncState(ctx, connId, REPO, {
          status: "success",
          completedAt: now(),
          recordsFetched: repoCount,
          recordsUpdated: repoCount,
          recordsFailed: 0,
        });
      } catch (error) {
        await setSyncState(ctx, connId, REPO, {
          status: "failed",
          completedAt: now(),
          lastError: error instanceof AppError ? error.message : "Repository sync failed.",
        });
        throw error;
      }

      // 2) Commits for the most recently pushed, non-archived repos (bounded).
      const cutoff = new Date(started.getTime() - COMMIT_WINDOW_DAYS * 86_400_000).toISOString();
      const targets = repos
        .filter((r) => !r.archived)
        .sort((a, b) => (b.pushedDate ?? "").localeCompare(a.pushedDate ?? ""))
        .slice(0, MAX_COMMIT_REPOS);
      await setSyncState(ctx, connId, "github_commit", {
        status: "running",
        startedAt: started,
        completedAt: null,
        lastError: null,
      });
      let commitCount = 0;
      try {
        for (const r of targets) {
          for (let page = 1; page <= COMMIT_PAGES; page++) {
            const res = await guard(connId, () =>
              client.listCommits(r.fullName, { page, perPage: 100, since: cutoff }),
            );
            if (res.items.length === 0) break;
            for (const raw of res.items) {
              const c = normalizeCommit(r.fullName, raw, started);
              await db.gitHubCommit.upsert({
                where: {
                  userId_repoExternalId_sha: {
                    userId: ctx.userId,
                    repoExternalId: r.externalId,
                    sha: c.sha,
                  },
                },
                create: {
                  userId: ctx.userId,
                  connectionId: connId,
                  repoExternalId: r.externalId,
                  repoFullName: r.fullName,
                  sha: c.sha,
                  message: c.message.slice(0, 500),
                  authorLogin: c.author.login,
                  authoredAt: c.authoredDate ? new Date(c.authoredDate) : null,
                  committedAt: c.committedDate ? new Date(c.committedDate) : null,
                  additions: c.additions,
                  deletions: c.deletions,
                  url: c.url,
                },
                update: {}, // idempotent: existing commits are immutable
              });
              commitCount++;
            }
            if (!res.hasNextPage) break;
          }
        }
        await setSyncState(ctx, connId, "github_commit", {
          status: "success",
          completedAt: now(),
          recordsFetched: commitCount,
          recordsUpdated: commitCount,
          recordsFailed: 0,
        });
      } catch (error) {
        await setSyncState(ctx, connId, "github_commit", {
          status: "partial",
          completedAt: now(),
          recordsFetched: commitCount,
          lastError: error instanceof AppError ? error.message : "Commit sync incomplete.",
        });
        // Repositories succeeded; surface the commit error but keep what we stored.
        throw error;
      }

      const completed = now();
      await db.integrationConnection.update({
        where: { id: connId },
        data: { lastSyncAt: completed, status: "connected", lastError: null },
      });
      return { repositories: repoCount, commits: commitCount, syncedAt: completed.toISOString() };
    },
  };
}
