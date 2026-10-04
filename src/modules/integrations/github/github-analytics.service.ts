import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors/app-error";
import {
  comparisonFor,
  metricResult,
  type DistributionBucket,
} from "@/modules/analytics/metric-result";
import {
  previousPeriod,
  resolvePeriod,
  toPeriodDto,
  type Period,
} from "@/modules/analytics/period";
import { utcDay } from "@/modules/shared/calendar";
import { toDateOnly } from "@/modules/shared/fields";
import type { ServiceContext } from "@/modules/shared/service-context";

import { decryptSecret } from "../crypto";
import { integrationRepository as repo } from "../integration.repository";
import type { IntegrationDeps } from "../integration.service";

import { createGitHubClient } from "./github.client";
import type { RepoDto } from "./github.normalize";

/**
 * GitHub Repository Intelligence analytics (Phase 9.6, ADR 0054). Reads the synced projection
 * (repository cache + GitHubCommit) and aggregates locally — no N+1 GitHub calls. All timestamps are
 * aggregated in UTC. Metrics are governed (metric catalogue); missing data is never coerced to zero.
 */
type RepoMeta = Partial<RepoDto> & { externalId: string; fullName: string };

const ACTIVITY_BUCKETS = ["active", "idle_30", "idle_90", "idle_180"] as const;
const ACTIVITY_LABEL: Record<string, string> = {
  active: "Active in period",
  idle_30: "No activity 30+ days",
  idle_90: "No activity 90+ days",
  idle_180: "No activity 180+ days",
};
const DAY = 86_400_000;

/** Resolve the GitHub period presets (incl. 7d/180d, which the shared resolver lacks) to a Period. */
function resolveGhPeriod(filters: { range: string; from?: Date; to?: Date }, now: Date): Period {
  const presetDays: Record<string, number> = { "7d": 7, "180d": 180 };
  if (filters.range in presetDays) {
    const days = presetDays[filters.range]!;
    const end = utcDay(now);
    const start = new Date(end.getTime() - (days - 1) * DAY);
    return { range: "custom", start, end, days, label: `Last ${days} days` };
  }
  return resolvePeriod(filters as never, now);
}

async function requireGithub(db: PrismaClient, userId: string) {
  const conn = await repo.findActiveByProvider(db, userId, "github");
  if (!conn || !conn.accessTokenEnc) throw new AppError("INTEGRATION_NOT_CONNECTED");
  return conn;
}

interface CommitAgg {
  in_period: number;
  prev: number;
  before: number;
  active_days: number;
  active_repos: number;
}

export function createGitHubAnalyticsService(db: PrismaClient, deps: IntegrationDeps = {}) {
  const now = deps.now ?? (() => new Date());
  const fetchImpl = deps.fetchImpl ?? fetch;

  async function cachedRepos(userId: string): Promise<RepoMeta[]> {
    const rows = await db.integrationExternalResource.findMany({
      where: { userId, provider: "github", resourceType: "repository" },
      select: { metadata: true },
      take: 1000,
    });
    return rows.map((r) => r.metadata as unknown as RepoMeta);
  }

  async function commitAgg(
    userId: string,
    period: Period,
    prev: Period | null,
  ): Promise<CommitAgg> {
    const bounded = Boolean(period.start && period.end);
    const end = period.end ? new Date(period.end.getTime() + DAY) : null;
    const prevEnd = prev?.end ? new Date(prev.end.getTime() + DAY) : null;
    const inF = bounded
      ? Prisma.sql`FILTER (WHERE authored_at >= ${period.start} AND authored_at < ${end})`
      : Prisma.sql`FILTER (WHERE authored_at IS NOT NULL)`;
    const prevF =
      bounded && prev
        ? Prisma.sql`FILTER (WHERE authored_at >= ${prev.start} AND authored_at < ${prevEnd})`
        : Prisma.sql`FILTER (WHERE false)`;
    const beforeF = bounded
      ? Prisma.sql`FILTER (WHERE authored_at < ${period.start})`
      : Prisma.sql`FILTER (WHERE false)`;
    const rows = await db.$queryRaw<CommitAgg[]>`
      SELECT
        (COUNT(*) ${inF})::int AS in_period,
        (COUNT(*) ${prevF})::int AS prev,
        (COUNT(*) ${beforeF})::int AS before,
        (COUNT(DISTINCT date_trunc('day', authored_at)) ${inF})::int AS active_days,
        (COUNT(DISTINCT repo_external_id) ${inF})::int AS active_repos
      FROM github_commits
      WHERE user_id = ${userId}::uuid AND authored_at IS NOT NULL`;
    return rows[0] ?? { in_period: 0, prev: 0, before: 0, active_days: 0, active_repos: 0 };
  }

  async function commitTrend(userId: string, period: Period): Promise<DistributionBucket[]> {
    const daily = period.days !== null && period.days <= 92;
    const unit = daily ? "day" : "month";
    const fmt = daily ? "YYYY-MM-DD" : "YYYY-MM";
    const window =
      period.start && period.end
        ? Prisma.sql`AND authored_at >= ${period.start} AND authored_at < ${new Date(period.end.getTime() + DAY)}`
        : Prisma.empty;
    const rows = await db.$queryRaw<{ bucket: string; count: number }[]>`
      SELECT to_char(date_trunc(${unit}, authored_at), ${fmt}) AS bucket, COUNT(*)::int AS count
      FROM github_commits
      WHERE user_id = ${userId}::uuid AND authored_at IS NOT NULL ${window}
      GROUP BY 1 ORDER BY 1`;
    return rows.slice(-120).map((r) => ({ key: r.bucket, label: r.bucket, value: r.count }));
  }

  async function commitsByRepo(userId: string, period: Period): Promise<DistributionBucket[]> {
    const window =
      period.start && period.end
        ? Prisma.sql`AND authored_at >= ${period.start} AND authored_at < ${new Date(period.end.getTime() + DAY)}`
        : Prisma.empty;
    const rows = await db.$queryRaw<{ key: string; label: string; count: number }[]>`
      SELECT repo_external_id AS key, repo_full_name AS label, COUNT(*)::int AS count
      FROM github_commits
      WHERE user_id = ${userId}::uuid AND authored_at IS NOT NULL ${window}
      GROUP BY 1, 2 ORDER BY count DESC LIMIT 15`;
    return rows.map((r) => ({ key: r.key, label: r.label, value: r.count }));
  }

  async function lastCommitByRepo(
    userId: string,
  ): Promise<Map<string, { last: Date | null; total: number }>> {
    const rows = await db.$queryRaw<
      { repo_external_id: string; last: Date | null; total: number }[]
    >`
      SELECT repo_external_id, MAX(authored_at) AS last, COUNT(*)::int AS total
      FROM github_commits WHERE user_id = ${userId}::uuid GROUP BY 1`;
    return new Map(rows.map((r) => [r.repo_external_id, { last: r.last, total: r.total }]));
  }

  /** Repository portfolio aggregation from the cached repo set + commit recency. */
  function repoPortfolio(
    repos: RepoMeta[],
    period: Period,
    lastCommit: Map<string, { last: Date | null }>,
  ) {
    const nowMs = now().getTime();
    const inPeriod = (iso?: string | null) =>
      Boolean(
        iso &&
        period.start &&
        period.end &&
        new Date(iso) >= period.start &&
        new Date(iso) <= new Date(period.end.getTime() + DAY),
      );
    let pub = 0,
      priv = 0,
      archived = 0,
      fork = 0,
      active = 0;
    const activityCounts: { active: number; idle_30: number; idle_90: number; idle_180: number } = {
      active: 0,
      idle_30: 0,
      idle_90: 0,
      idle_180: 0,
    };
    const languages = new Map<string, number>();
    for (const r of repos) {
      if (r.visibility === "private") priv++;
      else pub++;
      if (r.archived) archived++;
      if (r.fork) fork++;
      const lc = lastCommit.get(r.externalId)?.last ?? null;
      const lastActivity = Math.max(
        r.pushedDate ? new Date(r.pushedDate).getTime() : 0,
        lc ? lc.getTime() : 0,
      );
      const hasCommitInPeriod = period.start
        ? Boolean(
            lc && period.end && lc >= period.start && lc <= new Date(period.end.getTime() + DAY),
          )
        : lastActivity > 0;
      const isActive =
        hasCommitInPeriod || inPeriod(r.pushedDate) || (!period.start && lastActivity > 0);
      if (isActive) active++;
      const ageDays = lastActivity ? (nowMs - lastActivity) / DAY : Infinity;
      if (ageDays <= 30) activityCounts.active++;
      else if (ageDays <= 90) activityCounts.idle_30++;
      else if (ageDays <= 180) activityCounts.idle_90++;
      else activityCounts.idle_180++;
      const lang = r.language ?? "Unknown";
      languages.set(lang, (languages.get(lang) ?? 0) + 1);
    }
    return {
      total: repos.length,
      pub,
      priv,
      archived,
      fork,
      original: repos.length - fork,
      active,
      activityCounts,
      languages,
    };
  }

  return {
    async overview(ctx: ServiceContext, filters: { range: string; from?: Date; to?: Date }) {
      const conn = await requireGithub(db, ctx.userId);
      const period = resolveGhPeriod(filters, now());
      const periodDto = toPeriodDto(period);
      const prev = previousPeriod(period);
      const [repos, agg, lastCommit] = await Promise.all([
        cachedRepos(ctx.userId),
        commitAgg(ctx.userId, period, prev),
        lastCommitByRepo(ctx.userId),
      ]);
      const synced = repos.length > 0;
      const noData = synced
        ? "No matching data."
        : "GitHub is connected but not synchronized yet — run Sync.";
      const p = repoPortfolio(repos, period, lastCommit);
      const base = (value: number) => ({ value, hasBaseRecords: synced, noDataReason: noData });

      return {
        calculatedAt: now().toISOString(),
        evaluatedOn: toDateOnly(utcDay(now())),
        lastSyncedAt: conn.lastSyncAt?.toISOString() ?? null,
        synced,
        period: periodDto,
        recordCounts: { repositories: p.total },
        repositories: {
          total: metricResult("github.repositories_total", base(p.total)),
          active: metricResult("github.repositories_active", {
            ...base(p.active),
            period: periodDto,
          }),
          byVisibility: metricResult("github.repositories_by_visibility", {
            ...base(p.total),
            breakdown: [
              { key: "public", label: "Public", value: p.pub },
              { key: "private", label: "Private", value: p.priv },
            ],
          }),
          byType: metricResult("github.repositories_by_type", {
            ...base(p.total),
            breakdown: [
              { key: "original", label: "Original", value: p.original },
              { key: "fork", label: "Fork", value: p.fork },
            ],
          }),
          archived: p.archived,
          fork: p.fork,
          original: p.original,
        },
        commits: {
          total: metricResult("github.commits", {
            ...base(agg.in_period),
            period: periodDto,
            comparison: comparisonFor({
              previous: prev ? { value: agg.prev, period: toPeriodDto(prev) } : null,
              hasHistoryBeforePeriod: agg.before > 0,
              entityLabel: "commit",
            }),
          }),
          activeDays: metricResult("github.active_days", {
            ...base(agg.active_days),
            period: periodDto,
          }),
          activeRepos: agg.active_repos,
          avgPerActiveDay:
            agg.active_days > 0 ? Math.round((agg.in_period / agg.active_days) * 10) / 10 : null,
        },
      };
    },

    async analytics(ctx: ServiceContext, filters: { range: string; from?: Date; to?: Date }) {
      await requireGithub(db, ctx.userId);
      const period = resolveGhPeriod(filters, now());
      const periodDto = toPeriodDto(period);
      const [repos, trend, byRepo, lastCommit] = await Promise.all([
        cachedRepos(ctx.userId),
        commitTrend(ctx.userId, period),
        commitsByRepo(ctx.userId, period),
        lastCommitByRepo(ctx.userId),
      ]);
      const synced = repos.length > 0;
      const noData = synced ? "No matching data." : "Not synchronized — run Sync.";
      const p = repoPortfolio(repos, period, lastCommit);
      const base = (value: number) => ({ value, hasBaseRecords: synced, noDataReason: noData });

      const languageBuckets = [...p.languages.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([key, value]) => ({ key, label: key, value }));

      // Rankings (separate, transparent — never a combined score).
      const mostCommits = byRepo.slice(0, 10);
      const recency = repos
        .map((r) => ({
          externalId: r.externalId,
          fullName: r.fullName,
          lastActivity:
            Math.max(
              r.pushedDate ? new Date(r.pushedDate).getTime() : 0,
              lastCommit.get(r.externalId)?.last?.getTime() ?? 0,
            ) || null,
        }))
        .filter((r) => r.lastActivity);
      const mostRecent = [...recency]
        .sort((a, b) => b.lastActivity! - a.lastActivity!)
        .slice(0, 10)
        .map((r) => ({
          externalId: r.externalId,
          fullName: r.fullName,
          lastActivity: new Date(r.lastActivity!).toISOString(),
        }));
      const nowMs = now().getTime();
      const noRecent = [...recency]
        .filter((r) => (nowMs - r.lastActivity!) / DAY > 90)
        .sort((a, b) => a.lastActivity! - b.lastActivity!)
        .slice(0, 10)
        .map((r) => ({
          externalId: r.externalId,
          fullName: r.fullName,
          lastActivity: new Date(r.lastActivity!).toISOString(),
        }));

      return {
        calculatedAt: now().toISOString(),
        synced,
        period: periodDto,
        recordCounts: { repositories: p.total },
        commitTrend: metricResult("github.commit_trend", {
          ...base(trend.reduce((s, b) => s + b.value, 0)),
          period: periodDto,
          breakdown: trend,
        }),
        commitsByRepository: metricResult("github.commits_by_repository", {
          ...base(byRepo.reduce((s, b) => s + b.value, 0)),
          period: periodDto,
          breakdown: byRepo,
        }),
        languageDistribution: metricResult("github.language_distribution", {
          ...base(p.total),
          breakdown: languageBuckets,
        }),
        repositoriesByActivity: metricResult("github.repositories_by_activity", {
          ...base(p.total),
          breakdown: ACTIVITY_BUCKETS.map((k) => ({
            key: k,
            label: ACTIVITY_LABEL[k]!,
            value: p.activityCounts[k] ?? 0,
          })),
        }),
        byVisibility: metricResult("github.repositories_by_visibility", {
          ...base(p.total),
          breakdown: [
            { key: "public", label: "Public", value: p.pub },
            { key: "private", label: "Private", value: p.priv },
          ],
        }),
        rankings: { mostCommits, mostRecent, noRecent },
      };
    },

    /** Cached repository list with server-side filter/sort/pagination + facets. */
    async repositories(
      ctx: ServiceContext,
      query: {
        q?: string;
        visibility?: "public" | "private";
        type?: "original" | "fork";
        status?: "active" | "archived";
        language?: string;
        activity?: "recent" | "idle_30" | "idle_90" | "idle_180";
        sort?: string;
        page?: number;
        pageSize?: number;
      },
    ) {
      const conn = await requireGithub(db, ctx.userId);
      const [repos, lastCommit] = await Promise.all([
        cachedRepos(ctx.userId),
        lastCommitByRepo(ctx.userId),
      ]);
      const nowMs = now().getTime();
      const lastActivityOf = (r: RepoMeta) =>
        Math.max(
          r.pushedDate ? new Date(r.pushedDate).getTime() : 0,
          lastCommit.get(r.externalId)?.last?.getTime() ?? 0,
        ) || 0;

      let rows = repos.slice();
      if (query.q) {
        const q = query.q.toLowerCase();
        rows = rows.filter(
          (r) =>
            r.fullName.toLowerCase().includes(q) ||
            (r.description ?? "").toLowerCase().includes(q) ||
            (r.owner ?? "").toLowerCase().includes(q),
        );
      }
      if (query.visibility)
        rows = rows.filter((r) => (r.visibility ?? "public") === query.visibility);
      if (query.type === "fork") rows = rows.filter((r) => r.fork);
      if (query.type === "original") rows = rows.filter((r) => !r.fork);
      if (query.status === "archived") rows = rows.filter((r) => r.archived);
      if (query.status === "active") rows = rows.filter((r) => !r.archived);
      if (query.language) rows = rows.filter((r) => (r.language ?? "Unknown") === query.language);
      if (query.activity) {
        rows = rows.filter((r) => {
          const age = lastActivityOf(r) ? (nowMs - lastActivityOf(r)) / DAY : Infinity;
          if (query.activity === "recent") return age <= 30;
          if (query.activity === "idle_30") return age > 30;
          if (query.activity === "idle_90") return age > 90;
          return age > 180;
        });
      }
      const sort = query.sort ?? "pushed";
      rows.sort((a, b) => {
        switch (sort) {
          case "name":
            return a.fullName.localeCompare(b.fullName);
          case "stars":
            return (b.stars ?? 0) - (a.stars ?? 0);
          case "forks":
            return (b.forks ?? 0) - (a.forks ?? 0);
          case "issues":
            return (b.openIssues ?? 0) - (a.openIssues ?? 0);
          case "updated":
            return (b.updatedDate ?? "").localeCompare(a.updatedDate ?? "");
          case "commits":
            return (
              (lastCommit.get(b.externalId)?.total ?? 0) -
              (lastCommit.get(a.externalId)?.total ?? 0)
            );
          default:
            return lastActivityOf(b) - lastActivityOf(a);
        }
      });

      const page = Math.max(query.page ?? 1, 1);
      const pageSize = Math.min(Math.max(query.pageSize ?? 25, 1), 100);
      const total = rows.length;
      const data = rows.slice((page - 1) * pageSize, page * pageSize).map((r) => ({
        ...r,
        recentCommits: lastCommit.get(r.externalId)?.total ?? 0,
        lastCommitDate: lastCommit.get(r.externalId)?.last?.toISOString() ?? null,
      }));
      const languages = [...new Set(repos.map((r) => r.language ?? "Unknown"))].sort();
      const owners = [...new Set(repos.map((r) => r.owner).filter(Boolean))].sort() as string[];
      return {
        data,
        page: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
        facets: { languages, owners },
        lastSyncedAt: conn.lastSyncAt?.toISOString() ?? null,
        synced: repos.length > 0,
      };
    },

    /** GitHub-reported language byte composition for one cached repository (live). */
    async languages(ctx: ServiceContext, externalId: string) {
      const conn = await requireGithub(db, ctx.userId);
      const row = await db.integrationExternalResource.findFirst({
        where: { userId: ctx.userId, provider: "github", resourceType: "repository", externalId },
      });
      if (!row) throw new AppError("EXTERNAL_RESOURCE_NOT_FOUND");
      const meta = row.metadata as unknown as RepoMeta;
      const bytes = await createGitHubClient(
        decryptSecret(conn.accessTokenEnc!),
        fetchImpl,
      ).listLanguages(meta.fullName);
      const total = Object.values(bytes).reduce((s, b) => s + b, 0) || 1;
      return Object.entries(bytes)
        .sort((a, b) => b[1] - a[1])
        .map(([language, b]) => ({
          language,
          bytes: b,
          percent: Math.round((b / total) * 1000) / 10,
        }));
    },
  };
}
