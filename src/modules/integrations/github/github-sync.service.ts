import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors/app-error";
import type { ServiceContext } from "@/modules/shared/service-context";

import { decryptSecret } from "../crypto";
import { integrationRepository as repo } from "../integration.repository";
import type { IntegrationDeps } from "../integration.service";

import { createGitHubClient, type GitHubClient, type GitHubPage } from "./github.client";
import {
  normalizeCommit,
  normalizeContributor,
  normalizeIssue,
  normalizePullRequest,
  normalizeRelease,
  normalizeRepo,
  type RepoDto,
} from "./github.normalize";

/**
 * GitHub synchronization (Phase 9.7, ADR 0055 — extends ADR 0054). Explicitly triggered (no
 * continuous monitoring). One run synchronizes, in order: repositories (all pages, bounded), then
 * commits, pull requests, issues, releases and contributors across repositories.
 *
 * The strategy is scalable and resumable rather than a fixed "top-N repositories" cap:
 *  - every accessible repository is represented in the repository cache + sync state;
 *  - per resource, repositories are processed in a fair priority order (never-synced first, then the
 *    oldest-synced first), bounded by a per-run repository budget, so repeated runs cover everything;
 *  - synchronization is incremental — a per-repository cursor (the newest stored timestamp, or a
 *    per-repo marker) means an already-synced repository costs a cheap, often-empty request;
 *  - writes are idempotent (upsert on provider-native keys); duplicates are impossible;
 *  - GitHub rate limits are first-class: the run detects a low/zero remaining budget and stops
 *    gracefully, marking the resource `partial` with the repositories still pending — never a
 *    hammered provider and never partial data reported as complete;
 *  - transient provider failures get a small, bounded retry with backoff.
 */

const MAX_REPO_PAGES = 10; // × 100 = up to 1000 repositories cached per run
const INITIAL_COMMIT_WINDOW_DAYS = 365;
const RATE_LIMIT_FLOOR = 2; // stop before exhausting GitHub's budget
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 200;

/** Per-run, per-resource repository budgets and per-repository page caps (bounded individual work). */
const BUDGET = {
  commit: { repos: 150, pages: 5 },
  pull_request: { repos: 100, pages: 3 },
  issue: { repos: 100, pages: 3 },
  release: { repos: 150, pages: 2 },
  contributor: { repos: 150, pages: 1 },
} as const;

type ResourceKey = keyof typeof BUDGET;
const SYNC_RESOURCE: Record<ResourceKey, string> = {
  commit: "github_commit",
  pull_request: "github_pull_request",
  issue: "github_issue",
  release: "github_release",
  contributor: "github_contributor",
};

const REPO = "repository";
const DAY = 86_400_000;

interface SyncMarkers {
  [resource: string]: string | undefined;
}
type RepoRow = {
  externalId: string;
  fullName: string;
  archived: boolean;
  pushedDate: string | null;
};

export interface ResourceSyncResult {
  resource: string;
  status: "success" | "partial" | "failed";
  processed: number;
  pending: number;
  fetched: number;
  error: string | null;
}

export function createGitHubSyncService(db: PrismaClient, deps: IntegrationDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  async function connect(ctx: ServiceContext): Promise<{ connId: string; client: GitHubClient }> {
    const conn = await repo.findActiveByProvider(db, ctx.userId, "github");
    if (!conn || !conn.accessTokenEnc) throw new AppError("INTEGRATION_NOT_CONNECTED");
    return {
      connId: conn.id,
      client: createGitHubClient(decryptSecret(conn.accessTokenEnc), fetchImpl),
    };
  }

  /** Reflect auth/rate-limit failures in connection health, with bounded retry on transient errors. */
  async function guard<T>(connId: string, fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        return await fn();
      } catch (error) {
        if (error instanceof AppError) {
          if (error.code === "INTEGRATION_AUTH_FAILED") {
            await db.integrationConnection.update({
              where: { id: connId },
              data: { status: "expired", lastError: "The GitHub token is no longer valid." },
            });
            throw error;
          }
          if (error.code === "INTEGRATION_RATE_LIMITED") {
            await db.integrationConnection.update({
              where: { id: connId },
              data: { status: "degraded", lastError: "GitHub is rate-limiting requests." },
            });
            throw error;
          }
          if (error.code === "INTEGRATION_PROVIDER_UNAVAILABLE" && attempt < MAX_RETRIES) {
            await sleep(RETRY_BASE_MS * 2 ** attempt);
            attempt++;
            continue;
          }
        }
        throw error;
      }
    }
  }

  async function cacheRepo(
    ctx: ServiceContext,
    connId: string,
    r: RepoDto,
    at: Date,
    markers: SyncMarkers,
  ) {
    const metadata = {
      ...r,
      provenance: undefined,
      syncMarkers: markers,
    } as unknown as Prisma.InputJsonValue;
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
      cursor: string | null;
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

  /** Page a provider list with bounded pages and rate-limit awareness; `onPage` returns false to stop. */
  async function pageThrough<T>(
    connId: string,
    maxPages: number,
    fetchPage: (page: number) => Promise<GitHubPage<T>>,
    onPage: (items: T[]) => Promise<boolean> | boolean,
  ): Promise<{ stoppedForRateLimit: boolean }> {
    for (let page = 1; page <= maxPages; page++) {
      const res = await guard(connId, () => fetchPage(page));
      if (res.items.length === 0) break;
      const keepGoing = await onPage(res.items);
      if (!keepGoing) break;
      const remaining = res.rateLimit.remaining;
      if (remaining !== null && remaining <= RATE_LIMIT_FLOOR) return { stoppedForRateLimit: true };
      if (!res.hasNextPage) break;
    }
    return { stoppedForRateLimit: false };
  }

  /** Load the repository cache with sync markers (the per-repo per-resource resume state). */
  async function loadRepoRows(
    userId: string,
  ): Promise<{ rows: RepoRow[]; markers: Map<string, SyncMarkers> }> {
    const resources = await db.integrationExternalResource.findMany({
      where: { userId, provider: "github", resourceType: REPO },
      select: { externalId: true, metadata: true },
      take: 2000,
    });
    const rows: RepoRow[] = [];
    const markers = new Map<string, SyncMarkers>();
    for (const r of resources) {
      const meta = r.metadata as {
        fullName?: string;
        archived?: boolean;
        pushedDate?: string | null;
        syncMarkers?: SyncMarkers;
      };
      if (!meta.fullName) continue;
      rows.push({
        externalId: r.externalId,
        fullName: meta.fullName,
        archived: Boolean(meta.archived),
        pushedDate: meta.pushedDate ?? null,
      });
      markers.set(r.externalId, meta.syncMarkers ?? {});
    }
    return { rows, markers };
  }

  /** Persist a single repo's updated sync marker without clobbering its stored metadata. */
  async function touchMarker(
    userId: string,
    externalId: string,
    resource: ResourceKey,
    iso: string,
  ) {
    const row = await db.integrationExternalResource.findFirst({
      where: { userId, provider: "github", resourceType: REPO, externalId },
      select: { id: true, metadata: true },
    });
    if (!row) return;
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const syncMarkers = { ...((meta.syncMarkers as SyncMarkers) ?? {}), [resource]: iso };
    await db.integrationExternalResource.update({
      where: { id: row.id },
      data: { metadata: { ...meta, syncMarkers } as Prisma.InputJsonValue },
    });
  }

  /**
   * Fair, resumable repo ordering for a resource: repositories never synced for it come first (so
   * older/quiet repos are never starved), then the least-recently synced, then most-recently pushed.
   */
  function prioritize(rows: RepoRow[], markers: Map<string, SyncMarkers>, resource: ResourceKey) {
    return rows
      .filter((r) => !r.archived)
      .map((r) => ({ r, marker: markers.get(r.externalId)?.[resource] ?? null }))
      .sort((a, b) => {
        if (a.marker === null && b.marker === null)
          return (b.r.pushedDate ?? "").localeCompare(a.r.pushedDate ?? "");
        if (a.marker === null) return -1;
        if (b.marker === null) return 1;
        return a.marker.localeCompare(b.marker); // oldest-synced first
      })
      .map((x) => x.r);
  }

  /** Generic per-resource sync loop: priority order, per-run repo budget, rate-limit aware, resumable. */
  async function syncResource(
    ctx: ServiceContext,
    connId: string,
    resource: ResourceKey,
    started: Date,
    rows: RepoRow[],
    markers: Map<string, SyncMarkers>,
    perRepo: (repoRow: RepoRow) => Promise<{ fetched: number; stoppedForRateLimit: boolean }>,
  ): Promise<ResourceSyncResult> {
    const resourceType = SYNC_RESOURCE[resource];
    const ordered = prioritize(rows, markers, resource);
    await setSyncState(ctx, connId, resourceType, {
      status: "running",
      startedAt: started,
      completedAt: null,
      lastError: null,
    });
    const budget = BUDGET[resource].repos;
    let processed = 0;
    let fetched = 0;
    let stopped = false;
    let error: string | null = null;
    try {
      for (const row of ordered) {
        if (processed >= budget) break;
        const result = await perRepo(row);
        fetched += result.fetched;
        processed++;
        await touchMarker(ctx.userId, row.externalId, resource, now().toISOString());
        if (result.stoppedForRateLimit) {
          stopped = true;
          break;
        }
      }
    } catch (e) {
      if (e instanceof AppError && e.code === "INTEGRATION_RATE_LIMITED") {
        stopped = true;
        error = e.message;
      } else {
        error = e instanceof AppError ? e.message : `${resource} sync failed.`;
        await setSyncState(ctx, connId, resourceType, {
          status: "failed",
          completedAt: now(),
          recordsFetched: fetched,
          lastError: error,
        });
        return { resource: resourceType, status: "failed", processed, pending: 0, fetched, error };
      }
    }
    const pending = Math.max(0, ordered.length - processed);
    const status = stopped || pending > 0 ? "partial" : "success";
    await setSyncState(ctx, connId, resourceType, {
      status,
      completedAt: now(),
      cursor: JSON.stringify({ pending, total: ordered.length, rateLimited: stopped }),
      recordsFetched: fetched,
      recordsUpdated: fetched,
      recordsFailed: 0,
      lastError: error,
    });
    return { resource: resourceType, status, processed, pending, fetched, error };
  }

  return {
    /**
     * Full synchronization pass: repositories, then commits, pull requests, issues, releases and
     * contributors. Returns a per-resource breakdown with partial-sync visibility.
     */
    async sync(ctx: ServiceContext) {
      const { connId, client } = await connect(ctx);
      const started = now();
      await db.integrationConnection.update({
        where: { id: connId },
        data: { lastAttemptedSyncAt: started },
      });

      // Preserve existing per-repo sync markers across the repository refresh.
      const existing = await loadRepoRows(ctx.userId);

      // 1) Repositories (all pages, bounded).
      await setSyncState(ctx, connId, REPO, {
        status: "running",
        startedAt: started,
        completedAt: null,
        lastError: null,
      });
      let repoCount = 0;
      let repoStoppedForRateLimit = false;
      try {
        const { stoppedForRateLimit } = await pageThrough(
          connId,
          MAX_REPO_PAGES,
          (page) =>
            client.listRepositories({ page, perPage: 100, sort: "pushed", visibility: "all" }),
          async (items) => {
            for (const raw of items) {
              const r = normalizeRepo(raw, started);
              await cacheRepo(ctx, connId, r, started, existing.markers.get(r.externalId) ?? {});
              repoCount++;
            }
            return true;
          },
        );
        repoStoppedForRateLimit = stoppedForRateLimit;
        await setSyncState(ctx, connId, REPO, {
          status: repoStoppedForRateLimit ? "partial" : "success",
          completedAt: now(),
          recordsFetched: repoCount,
          recordsUpdated: repoCount,
          recordsFailed: 0,
          cursor: JSON.stringify({ rateLimited: repoStoppedForRateLimit }),
        });
      } catch (error) {
        await setSyncState(ctx, connId, REPO, {
          status: "failed",
          completedAt: now(),
          lastError: error instanceof AppError ? error.message : "Repository sync failed.",
        });
        throw error;
      }

      // Reload repo rows + markers after the refresh.
      const { rows, markers } = await loadRepoRows(ctx.userId);

      // Per-repo incremental cursors from the projections (newest stored timestamp).
      const [commitCursors, prCursors, issueCursors] = await Promise.all([
        db.gitHubCommit.groupBy({
          by: ["repoExternalId"],
          where: { userId: ctx.userId },
          _max: { committedAt: true },
        }),
        db.gitHubPullRequest.groupBy({
          by: ["repoExternalId"],
          where: { userId: ctx.userId },
          _max: { ghUpdatedAt: true },
        }),
        db.gitHubIssue.groupBy({
          by: ["repoExternalId"],
          where: { userId: ctx.userId },
          _max: { ghUpdatedAt: true },
        }),
      ]);
      const commitSince = new Map(commitCursors.map((c) => [c.repoExternalId, c._max.committedAt]));
      const prSince = new Map(prCursors.map((c) => [c.repoExternalId, c._max.ghUpdatedAt]));
      const issueSince = new Map(issueCursors.map((c) => [c.repoExternalId, c._max.ghUpdatedAt]));

      const results: ResourceSyncResult[] = [];

      // 2) Commits — incremental since the newest stored commit (or an initial window).
      results.push(
        await syncResource(ctx, connId, "commit", started, rows, markers, async (row) => {
          const cursor = commitSince.get(row.externalId) ?? null;
          const since = (
            cursor ?? new Date(started.getTime() - INITIAL_COMMIT_WINDOW_DAYS * DAY)
          ).toISOString();
          let fetched = 0;
          const { stoppedForRateLimit } = await pageThrough(
            connId,
            BUDGET.commit.pages,
            (page) => client.listCommits(row.fullName, { page, perPage: 100, since }),
            async (items) => {
              for (const raw of items) {
                const c = normalizeCommit(row.fullName, raw, started);
                await db.gitHubCommit.upsert({
                  where: {
                    userId_repoExternalId_sha: {
                      userId: ctx.userId,
                      repoExternalId: row.externalId,
                      sha: c.sha,
                    },
                  },
                  create: {
                    userId: ctx.userId,
                    connectionId: connId,
                    repoExternalId: row.externalId,
                    repoFullName: row.fullName,
                    sha: c.sha,
                    message: c.message.slice(0, 500),
                    authorLogin: c.author.login,
                    authoredAt: c.authoredDate ? new Date(c.authoredDate) : null,
                    committedAt: c.committedDate ? new Date(c.committedDate) : null,
                    additions: c.additions,
                    deletions: c.deletions,
                    url: c.url,
                  },
                  update: {},
                });
                fetched++;
              }
              return true;
            },
          );
          return { fetched, stoppedForRateLimit };
        }),
      );

      // 3) Pull requests — incremental: stop paging once past the newest stored update.
      results.push(
        await syncResource(ctx, connId, "pull_request", started, rows, markers, async (row) => {
          const since = prSince.get(row.externalId) ?? null;
          let fetched = 0;
          const { stoppedForRateLimit } = await pageThrough(
            connId,
            BUDGET.pull_request.pages,
            (page) => client.listPullRequests(row.fullName, { page, perPage: 100 }),
            async (items) => {
              let reachedKnown = false;
              for (const raw of items) {
                const pr = normalizePullRequest(row.fullName, raw, started);
                if (since && pr.updatedDate && new Date(pr.updatedDate) <= since) {
                  reachedKnown = true;
                  continue;
                }
                await db.gitHubPullRequest.upsert({
                  where: {
                    userId_repoExternalId_number: {
                      userId: ctx.userId,
                      repoExternalId: row.externalId,
                      number: pr.number,
                    },
                  },
                  create: {
                    userId: ctx.userId,
                    connectionId: connId,
                    repoExternalId: row.externalId,
                    repoFullName: row.fullName,
                    externalId: pr.externalId,
                    number: pr.number,
                    title: pr.title?.slice(0, 500) ?? null,
                    authorLogin: pr.authorLogin,
                    state: pr.state,
                    draft: pr.draft,
                    merged: pr.merged,
                    baseBranch: pr.baseBranch,
                    headBranch: pr.headBranch,
                    comments: pr.comments,
                    ghCreatedAt: pr.createdDate ? new Date(pr.createdDate) : null,
                    ghUpdatedAt: pr.updatedDate ? new Date(pr.updatedDate) : null,
                    closedAt: pr.closedDate ? new Date(pr.closedDate) : null,
                    mergedAt: pr.mergedDate ? new Date(pr.mergedDate) : null,
                    url: pr.url,
                  },
                  update: {
                    title: pr.title?.slice(0, 500) ?? null,
                    state: pr.state,
                    draft: pr.draft,
                    merged: pr.merged,
                    comments: pr.comments,
                    ghUpdatedAt: pr.updatedDate ? new Date(pr.updatedDate) : null,
                    closedAt: pr.closedDate ? new Date(pr.closedDate) : null,
                    mergedAt: pr.mergedDate ? new Date(pr.mergedDate) : null,
                  },
                });
                fetched++;
              }
              return !reachedKnown; // stop once we've caught up to known history
            },
          );
          return { fetched, stoppedForRateLimit };
        }),
      );

      // 4) Issues — incremental via the `since` (updated) filter; PRs excluded.
      results.push(
        await syncResource(ctx, connId, "issue", started, rows, markers, async (row) => {
          const cursor = issueSince.get(row.externalId) ?? null;
          const since = cursor ? cursor.toISOString() : undefined;
          let fetched = 0;
          const { stoppedForRateLimit } = await pageThrough(
            connId,
            BUDGET.issue.pages,
            (page) => client.listIssues(row.fullName, { page, perPage: 100, since }),
            async (items) => {
              for (const raw of items) {
                const issue = normalizeIssue(row.fullName, raw, started);
                if (issue.isPullRequest) continue; // never double-count PRs as issues
                await db.gitHubIssue.upsert({
                  where: {
                    userId_repoExternalId_number: {
                      userId: ctx.userId,
                      repoExternalId: row.externalId,
                      number: issue.number,
                    },
                  },
                  create: {
                    userId: ctx.userId,
                    connectionId: connId,
                    repoExternalId: row.externalId,
                    repoFullName: row.fullName,
                    externalId: issue.externalId,
                    number: issue.number,
                    title: issue.title?.slice(0, 500) ?? null,
                    authorLogin: issue.authorLogin,
                    state: issue.state,
                    comments: issue.comments,
                    labels: issue.labels.slice(0, 50),
                    assignees: issue.assignees.slice(0, 50),
                    milestone: issue.milestone?.slice(0, 200) ?? null,
                    ghCreatedAt: issue.createdDate ? new Date(issue.createdDate) : null,
                    ghUpdatedAt: issue.updatedDate ? new Date(issue.updatedDate) : null,
                    closedAt: issue.closedDate ? new Date(issue.closedDate) : null,
                    url: issue.url,
                  },
                  update: {
                    title: issue.title?.slice(0, 500) ?? null,
                    state: issue.state,
                    comments: issue.comments,
                    labels: issue.labels.slice(0, 50),
                    assignees: issue.assignees.slice(0, 50),
                    milestone: issue.milestone?.slice(0, 200) ?? null,
                    ghUpdatedAt: issue.updatedDate ? new Date(issue.updatedDate) : null,
                    closedAt: issue.closedDate ? new Date(issue.closedDate) : null,
                  },
                });
                fetched++;
              }
              return true;
            },
          );
          return { fetched, stoppedForRateLimit };
        }),
      );

      // 5) Releases — explicit GitHub objects (never inferred from commits).
      results.push(
        await syncResource(ctx, connId, "release", started, rows, markers, async (row) => {
          let fetched = 0;
          const { stoppedForRateLimit } = await pageThrough(
            connId,
            BUDGET.release.pages,
            (page) => client.listReleases(row.fullName, { page, perPage: 100 }),
            async (items) => {
              for (const raw of items) {
                const rel = normalizeRelease(row.fullName, raw, started);
                await db.gitHubRelease.upsert({
                  where: {
                    userId_repoExternalId_externalId: {
                      userId: ctx.userId,
                      repoExternalId: row.externalId,
                      externalId: rel.externalId,
                    },
                  },
                  create: {
                    userId: ctx.userId,
                    connectionId: connId,
                    repoExternalId: row.externalId,
                    repoFullName: row.fullName,
                    externalId: rel.externalId,
                    tagName: rel.tagName,
                    name: rel.name?.slice(0, 300) ?? null,
                    authorLogin: rel.authorLogin,
                    draft: rel.draft,
                    prerelease: rel.prerelease,
                    ghCreatedAt: rel.createdDate ? new Date(rel.createdDate) : null,
                    publishedAt: rel.publishedDate ? new Date(rel.publishedDate) : null,
                    url: rel.url,
                  },
                  update: {
                    tagName: rel.tagName,
                    name: rel.name?.slice(0, 300) ?? null,
                    draft: rel.draft,
                    prerelease: rel.prerelease,
                    publishedAt: rel.publishedDate ? new Date(rel.publishedDate) : null,
                  },
                });
                fetched++;
              }
              return true;
            },
          );
          return { fetched, stoppedForRateLimit };
        }),
      );

      // 6) Contributors — GitHub's own per-repo attribution (evidence, never a ranking score).
      results.push(
        await syncResource(ctx, connId, "contributor", started, rows, markers, async (row) => {
          let fetched = 0;
          const { stoppedForRateLimit } = await pageThrough(
            connId,
            BUDGET.contributor.pages,
            (page) => client.listContributors(row.fullName, { page, perPage: 100 }),
            async (items) => {
              for (const raw of items) {
                const c = normalizeContributor(row.fullName, raw, started);
                if (!c) continue;
                await db.gitHubContributor.upsert({
                  where: {
                    userId_repoExternalId_login: {
                      userId: ctx.userId,
                      repoExternalId: row.externalId,
                      login: c.login,
                    },
                  },
                  create: {
                    userId: ctx.userId,
                    connectionId: connId,
                    repoExternalId: row.externalId,
                    repoFullName: row.fullName,
                    login: c.login,
                    contributions: c.contributions,
                    avatarUrl: c.avatarUrl,
                    url: c.url,
                  },
                  update: { contributions: c.contributions, avatarUrl: c.avatarUrl, url: c.url },
                });
                fetched++;
              }
              return true;
            },
          );
          return { fetched, stoppedForRateLimit };
        }),
      );

      const completed = now();
      const anyPartial = repoStoppedForRateLimit || results.some((r) => r.status !== "success");
      const anyFailed = results.some((r) => r.status === "failed");
      await db.integrationConnection.update({
        where: { id: connId },
        data: {
          lastSyncAt: completed,
          status: anyPartial && !anyFailed ? "degraded" : anyFailed ? "degraded" : "connected",
          lastError: anyFailed
            ? "Some GitHub resources failed to synchronize."
            : anyPartial
              ? "GitHub synchronization partially completed (rate limits or budget). Re-run Sync."
              : null,
        },
      });

      return {
        syncedAt: completed.toISOString(),
        repositories: repoCount,
        repositoriesPartial: repoStoppedForRateLimit,
        resources: Object.fromEntries(results.map((r) => [r.resource, r])),
        partial: anyPartial,
      };
    },
  };
}
