import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  comparisonFor,
  metricResult,
  type DistributionBucket,
  type MetricResult,
} from "@/modules/analytics/metric-result";
import { previousPeriod, toPeriodDto, type Period } from "@/modules/analytics/period";
import type { ServiceContext } from "@/modules/shared/service-context";

import type { IntegrationDeps } from "../integration.service";

import {
  cachedRepos,
  DAY,
  periodUpperBound,
  requireGithub,
  resolveGhPeriod,
  type RangeFilters,
} from "./github-shared";

/**
 * GitHub Intelligence Expansion analytics (Phase 9.7, ADR 0055). Reads the synced projections
 * (pull requests, issues, releases, contributors, commits) and aggregates locally — no N+1 GitHub
 * calls. All timestamps are aggregated in UTC. Every metric is governed by the catalogue; missing
 * data is never coerced to zero and unavailable values are never fabricated.
 */

const DOW_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function trendUnit(period: Period) {
  const daily = period.days !== null && period.days <= 92;
  return { unit: daily ? "day" : "month", fmt: daily ? "YYYY-MM-DD" : "YYYY-MM" } as const;
}

function windowSql(column: Prisma.Sql, period: Period): Prisma.Sql {
  const upper = periodUpperBound(period);
  if (!period.start || !upper) return Prisma.sql`AND ${column} IS NOT NULL`;
  return Prisma.sql`AND ${column} >= ${period.start} AND ${column} < ${upper}`;
}

export function createGitHubInsightsService(db: PrismaClient, deps: IntegrationDeps = {}) {
  const now = deps.now ?? (() => new Date());

  function periodOf(filters: RangeFilters) {
    const period = now0(filters);
    return period;
  }
  function now0(filters: RangeFilters): Period {
    return resolveGhPeriod(filters, now());
  }

  async function syncedFlag(userId: string): Promise<boolean> {
    const count = await db.integrationExternalResource.count({
      where: { userId, provider: "github", resourceType: "repository" },
    });
    return count > 0;
  }

  function baseOf(synced: boolean) {
    const noData = synced
      ? "No matching data in this period."
      : "GitHub is connected but not synchronized yet — run Sync.";
    return (
      value: number,
      extra: Record<string, unknown> = {},
    ): Parameters<typeof metricResult>[1] =>
      ({ value, hasBaseRecords: synced, noDataReason: noData, ...extra }) as never;
  }

  // ── Pull requests ───────────────────────────────────────────────────────────
  async function pullRequests(ctx: ServiceContext, filters: RangeFilters & { repo?: string }) {
    await requireGithub(db, ctx.userId);
    const period = periodOf(filters);
    const periodDto = toPeriodDto(period);
    const synced = await syncedFlag(ctx.userId);
    const base = baseOf(synced);
    const upper = periodUpperBound(period);
    const inPeriod: Prisma.DateTimeNullableFilter =
      period.start && upper ? { gte: period.start, lt: upper } : { not: null };

    const repoWhere = filters.repo ? { repoExternalId: filters.repo } : {};
    const scope = { userId: ctx.userId, ...repoWhere };

    const [opened, merged, open, resolved, mergedResolved, prev, before] = await Promise.all([
      db.gitHubPullRequest.count({ where: { ...scope, ghCreatedAt: inPeriod } }),
      db.gitHubPullRequest.count({ where: { ...scope, mergedAt: inPeriod } }),
      db.gitHubPullRequest.count({ where: { ...scope, state: "open" } }),
      db.gitHubPullRequest.count({ where: { ...scope, closedAt: inPeriod } }),
      db.gitHubPullRequest.count({ where: { ...scope, mergedAt: inPeriod } }),
      previousPeriod(period)
        ? db.gitHubPullRequest.count({
            where: {
              ...scope,
              ghCreatedAt: {
                gte: previousPeriod(period)!.start!,
                lt: new Date(previousPeriod(period)!.end!.getTime() + DAY),
              },
            },
          })
        : Promise.resolve(0),
      period.start
        ? db.gitHubPullRequest.count({ where: { ...scope, ghCreatedAt: { lt: period.start } } })
        : Promise.resolve(0),
    ]);

    const trend = await trendOf(
      Prisma.sql`github_pull_requests`,
      Prisma.sql`gh_created_at`,
      ctx.userId,
      period,
      filters.repo,
    );
    const byRepo = await byRepoOf(
      Prisma.sql`github_pull_requests`,
      Prisma.sql`gh_created_at`,
      ctx.userId,
      period,
      filters.repo,
    );

    // State distribution for PRs opened in the period.
    const stateRows = await db.$queryRaw<{ bucket: string; count: number }[]>`
      SELECT CASE WHEN merged THEN 'merged' WHEN state = 'closed' THEN 'closed' ELSE 'open' END AS bucket,
             COUNT(*)::int AS count
      FROM github_pull_requests
      WHERE user_id = ${ctx.userId}::uuid
        ${filters.repo ? Prisma.sql`AND repo_external_id = ${filters.repo}` : Prisma.empty}
        ${windowSql(Prisma.sql`gh_created_at`, period)}
      GROUP BY 1`;
    const stateMap = new Map(stateRows.map((r) => [r.bucket, r.count]));
    const byState: DistributionBucket[] = [
      { key: "open", label: "Open", value: stateMap.get("open") ?? 0 },
      { key: "merged", label: "Merged", value: stateMap.get("merged") ?? 0 },
      { key: "closed", label: "Closed (not merged)", value: stateMap.get("closed") ?? 0 },
    ];

    // Median time-to-merge (hours) for PRs merged in the period.
    const ttmRows = await db.$queryRaw<{ median_hours: number | null; n: number }[]>`
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM (merged_at - gh_created_at)) / 3600.0
             ) AS median_hours,
             COUNT(*)::int AS n
      FROM github_pull_requests
      WHERE user_id = ${ctx.userId}::uuid AND merged_at IS NOT NULL AND gh_created_at IS NOT NULL
        ${filters.repo ? Prisma.sql`AND repo_external_id = ${filters.repo}` : Prisma.empty}
        ${windowSql(Prisma.sql`merged_at`, period)}`;
    const ttm = ttmRows[0] ?? { median_hours: null, n: 0 };

    const mergeRateInsufficient =
      resolved === 0 ? "No pull requests were resolved in this period." : null;
    const ttmInsufficient =
      ttm.n < 3 ? "Too few pull requests merged in this period to report a reliable median." : null;

    return {
      calculatedAt: now().toISOString(),
      synced,
      period: periodDto,
      kpis: {
        opened: metricResult(
          "github.pull_requests",
          base(opened, {
            period: periodDto,
            comparison: comparisonFor({
              previous: previousPeriod(period)
                ? { value: prev, period: toPeriodDto(previousPeriod(period)!) }
                : null,
              hasHistoryBeforePeriod: before > 0,
              entityLabel: "pull request",
            }),
          }),
        ),
        merged: metricResult("github.pull_requests_merged", base(merged, { period: periodDto })),
        open: metricResult("github.pull_requests_open", base(open)),
        mergeRate: metricResult(
          "github.pull_requests_merge_rate",
          base(resolved > 0 ? Math.round((mergedResolved / resolved) * 1000) / 1000 : 0, {
            period: periodDto,
            insufficientReason: mergeRateInsufficient,
            breakdown: [
              { key: "merged", label: "Merged", value: mergedResolved },
              { key: "resolved", label: "Resolved", value: resolved },
            ],
          }),
        ),
        timeToMerge: metricResult(
          "github.pull_request_time_to_merge",
          base(ttm.median_hours !== null ? Math.round(ttm.median_hours * 10) / 10 : 0, {
            period: periodDto,
            insufficientReason: ttmInsufficient,
          }),
        ),
      },
      trend: metricResult(
        "github.pull_request_trend",
        base(
          trend.reduce((s, b) => s + b.value, 0),
          { period: periodDto, breakdown: trend },
        ),
      ),
      byRepository: metricResult(
        "github.pull_requests_by_repository",
        base(
          byRepo.reduce((s, b) => s + b.value, 0),
          { period: periodDto, breakdown: byRepo },
        ),
      ),
      byState: metricResult(
        "github.pull_requests_by_state",
        base(
          byState.reduce((s, b) => s + b.value, 0),
          { period: periodDto, breakdown: byState },
        ),
      ),
    };
  }

  async function pullRequestList(
    ctx: ServiceContext,
    query: { state?: string; repo?: string; page?: number; pageSize?: number },
  ) {
    await requireGithub(db, ctx.userId);
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 25, 1), 100);
    const where: Prisma.GitHubPullRequestWhereInput = { userId: ctx.userId };
    if (query.repo) where.repoExternalId = query.repo;
    if (query.state === "open") where.state = "open";
    else if (query.state === "merged") where.merged = true;
    else if (query.state === "closed") Object.assign(where, { state: "closed", merged: false });
    const [rows, total] = await Promise.all([
      db.gitHubPullRequest.findMany({
        where,
        orderBy: [{ ghCreatedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.gitHubPullRequest.count({ where }),
    ]);
    return {
      data: rows.map((r) => ({
        number: r.number,
        title: r.title,
        author: r.authorLogin,
        repoFullName: r.repoFullName,
        repoExternalId: r.repoExternalId,
        state: r.merged ? "merged" : r.state,
        draft: r.draft,
        createdDate: r.ghCreatedAt?.toISOString() ?? null,
        mergedDate: r.mergedAt?.toISOString() ?? null,
        closedDate: r.closedAt?.toISOString() ?? null,
        url: r.url,
      })),
      page: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  // ── Issues ────────────────────────────────────────────────────────────────
  async function issues(ctx: ServiceContext, filters: RangeFilters & { repo?: string }) {
    await requireGithub(db, ctx.userId);
    const period = periodOf(filters);
    const periodDto = toPeriodDto(period);
    const synced = await syncedFlag(ctx.userId);
    const base = baseOf(synced);
    const upper = periodUpperBound(period);
    const inPeriod: Prisma.DateTimeNullableFilter =
      period.start && upper ? { gte: period.start, lt: upper } : { not: null };
    const repoWhere = filters.repo ? { repoExternalId: filters.repo } : {};
    const scope = { userId: ctx.userId, ...repoWhere };

    const [opened, closed, open, prev, before] = await Promise.all([
      db.gitHubIssue.count({ where: { ...scope, ghCreatedAt: inPeriod } }),
      db.gitHubIssue.count({ where: { ...scope, closedAt: inPeriod } }),
      db.gitHubIssue.count({ where: { ...scope, state: "open" } }),
      previousPeriod(period)
        ? db.gitHubIssue.count({
            where: {
              ...scope,
              ghCreatedAt: {
                gte: previousPeriod(period)!.start!,
                lt: new Date(previousPeriod(period)!.end!.getTime() + DAY),
              },
            },
          })
        : Promise.resolve(0),
      period.start
        ? db.gitHubIssue.count({ where: { ...scope, ghCreatedAt: { lt: period.start } } })
        : Promise.resolve(0),
    ]);

    // Of the issues opened in the period, how many are now closed (for closure rate).
    const closedOfOpened = await db.gitHubIssue.count({
      where: { ...scope, ghCreatedAt: inPeriod, state: "closed" },
    });

    const trend = await trendOf(
      Prisma.sql`github_issues`,
      Prisma.sql`gh_created_at`,
      ctx.userId,
      period,
      filters.repo,
    );
    const byRepo = await byRepoOf(
      Prisma.sql`github_issues`,
      Prisma.sql`gh_created_at`,
      ctx.userId,
      period,
      filters.repo,
    );

    const stateRows = await db.$queryRaw<{ bucket: string; count: number }[]>`
      SELECT state AS bucket, COUNT(*)::int AS count
      FROM github_issues
      WHERE user_id = ${ctx.userId}::uuid
        ${filters.repo ? Prisma.sql`AND repo_external_id = ${filters.repo}` : Prisma.empty}
        ${windowSql(Prisma.sql`gh_created_at`, period)}
      GROUP BY 1`;
    const stateMap = new Map(stateRows.map((r) => [r.bucket, r.count]));
    const byStateDist: DistributionBucket[] = [
      { key: "open", label: "Open", value: stateMap.get("open") ?? 0 },
      { key: "closed", label: "Closed", value: stateMap.get("closed") ?? 0 },
    ];

    const labelRows = await db.$queryRaw<{ bucket: string; count: number }[]>`
      SELECT label AS bucket, COUNT(*)::int AS count
      FROM github_issues, unnest(labels) AS label
      WHERE user_id = ${ctx.userId}::uuid
        ${filters.repo ? Prisma.sql`AND repo_external_id = ${filters.repo}` : Prisma.empty}
        ${windowSql(Prisma.sql`gh_created_at`, period)}
      GROUP BY 1 ORDER BY count DESC LIMIT 15`;
    const labels = labelRows.map((r) => ({ key: r.bucket, label: r.bucket, value: r.count }));

    return {
      calculatedAt: now().toISOString(),
      synced,
      period: periodDto,
      kpis: {
        opened: metricResult(
          "github.issues",
          base(opened, {
            period: periodDto,
            comparison: comparisonFor({
              previous: previousPeriod(period)
                ? { value: prev, period: toPeriodDto(previousPeriod(period)!) }
                : null,
              hasHistoryBeforePeriod: before > 0,
              entityLabel: "issue",
            }),
          }),
        ),
        closed: metricResult("github.issues_closed", base(closed, { period: periodDto })),
        open: metricResult("github.issues_open", base(open)),
        closureRate: metricResult(
          "github.issue_closure_rate",
          base(opened > 0 ? Math.round((closedOfOpened / opened) * 1000) / 1000 : 0, {
            period: periodDto,
            insufficientReason: opened === 0 ? "No issues were opened in this period." : null,
            breakdown: [
              { key: "closed", label: "Closed", value: closedOfOpened },
              { key: "opened", label: "Opened", value: opened },
            ],
          }),
        ),
      },
      trend: metricResult(
        "github.issue_trend",
        base(
          trend.reduce((s, b) => s + b.value, 0),
          { period: periodDto, breakdown: trend },
        ),
      ),
      byRepository: metricResult(
        "github.issues_by_repository",
        base(
          byRepo.reduce((s, b) => s + b.value, 0),
          { period: periodDto, breakdown: byRepo },
        ),
      ),
      byState: metricResult(
        "github.issues_by_state",
        base(
          byStateDist.reduce((s, b) => s + b.value, 0),
          { period: periodDto, breakdown: byStateDist },
        ),
      ),
      labels: metricResult(
        "github.issue_labels",
        base(
          labels.reduce((s, b) => s + b.value, 0),
          { period: periodDto, breakdown: labels },
        ),
      ),
    };
  }

  async function issueList(
    ctx: ServiceContext,
    query: { state?: string; repo?: string; label?: string; page?: number; pageSize?: number },
  ) {
    await requireGithub(db, ctx.userId);
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 25, 1), 100);
    const where: Prisma.GitHubIssueWhereInput = { userId: ctx.userId };
    if (query.repo) where.repoExternalId = query.repo;
    if (query.state === "open" || query.state === "closed") where.state = query.state;
    if (query.label) where.labels = { has: query.label };
    const [rows, total] = await Promise.all([
      db.gitHubIssue.findMany({
        where,
        orderBy: [{ ghCreatedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.gitHubIssue.count({ where }),
    ]);
    return {
      data: rows.map((r) => ({
        number: r.number,
        title: r.title,
        author: r.authorLogin,
        repoFullName: r.repoFullName,
        repoExternalId: r.repoExternalId,
        state: r.state,
        labels: r.labels,
        comments: r.comments,
        createdDate: r.ghCreatedAt?.toISOString() ?? null,
        closedDate: r.closedAt?.toISOString() ?? null,
        url: r.url,
      })),
      page: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  // ── Releases ────────────────────────────────────────────────────────────────
  async function releases(ctx: ServiceContext, filters: RangeFilters & { repo?: string }) {
    await requireGithub(db, ctx.userId);
    const period = periodOf(filters);
    const periodDto = toPeriodDto(period);
    const synced = await syncedFlag(ctx.userId);
    const base = baseOf(synced);
    const upper = periodUpperBound(period);
    const inPeriod: Prisma.DateTimeNullableFilter =
      period.start && upper ? { gte: period.start, lt: upper } : { not: null };
    const repoWhere = filters.repo ? { repoExternalId: filters.repo } : {};
    const scope = { userId: ctx.userId, draft: false, ...repoWhere };

    const published = await db.gitHubRelease.count({ where: { ...scope, publishedAt: inPeriod } });

    const trend = await trendOf(
      Prisma.sql`github_releases`,
      Prisma.sql`published_at`,
      ctx.userId,
      period,
      filters.repo,
      Prisma.sql`AND draft = false`,
    );
    const byRepo = await byRepoOf(
      Prisma.sql`github_releases`,
      Prisma.sql`published_at`,
      ctx.userId,
      period,
      filters.repo,
      Prisma.sql`AND draft = false`,
    );

    // Repository release coverage (point-in-time across all synced repos).
    const repos = await cachedRepos(db, ctx.userId);
    const withReleaseRows = await db.gitHubRelease.groupBy({
      by: ["repoExternalId"],
      where: { userId: ctx.userId, draft: false },
    });
    const reposWith = new Set(withReleaseRows.map((r) => r.repoExternalId)).size;

    const latest = await db.gitHubRelease.findFirst({
      where: { userId: ctx.userId, draft: false, publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" },
    });

    const prereleaseRows = await db.$queryRaw<{ bucket: string; count: number }[]>`
      SELECT CASE WHEN prerelease THEN 'prerelease' ELSE 'stable' END AS bucket, COUNT(*)::int AS count
      FROM github_releases
      WHERE user_id = ${ctx.userId}::uuid AND draft = false
        ${filters.repo ? Prisma.sql`AND repo_external_id = ${filters.repo}` : Prisma.empty}
        ${windowSql(Prisma.sql`published_at`, period)}
      GROUP BY 1`;
    const prMap = new Map(prereleaseRows.map((r) => [r.bucket, r.count]));

    return {
      calculatedAt: now().toISOString(),
      synced,
      period: periodDto,
      kpis: {
        total: metricResult("github.releases", base(published, { period: periodDto })),
      },
      stability: {
        stable: prMap.get("stable") ?? 0,
        prerelease: prMap.get("prerelease") ?? 0,
      },
      coverage: {
        reposWithReleases: reposWith,
        reposTotal: repos.length,
        reposWithout: Math.max(0, repos.length - reposWith),
      },
      latest: latest
        ? {
            tagName: latest.tagName,
            name: latest.name,
            repoFullName: latest.repoFullName,
            publishedDate: latest.publishedAt?.toISOString() ?? null,
            prerelease: latest.prerelease,
            url: latest.url,
          }
        : null,
      trend: metricResult(
        "github.release_trend",
        base(
          trend.reduce((s, b) => s + b.value, 0),
          { period: periodDto, breakdown: trend },
        ),
      ),
      byRepository: metricResult(
        "github.releases_by_repository",
        base(
          byRepo.reduce((s, b) => s + b.value, 0),
          { period: periodDto, breakdown: byRepo },
        ),
      ),
    };
  }

  async function releaseList(
    ctx: ServiceContext,
    query: { repo?: string; page?: number; pageSize?: number },
  ) {
    await requireGithub(db, ctx.userId);
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 25, 1), 100);
    const where: Prisma.GitHubReleaseWhereInput = { userId: ctx.userId };
    if (query.repo) where.repoExternalId = query.repo;
    const [rows, total] = await Promise.all([
      db.gitHubRelease.findMany({
        where,
        orderBy: [{ publishedAt: "desc" }, { ghCreatedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.gitHubRelease.count({ where }),
    ]);
    return {
      data: rows.map((r) => ({
        tagName: r.tagName,
        name: r.name,
        author: r.authorLogin,
        repoFullName: r.repoFullName,
        repoExternalId: r.repoExternalId,
        draft: r.draft,
        prerelease: r.prerelease,
        publishedDate: r.publishedAt?.toISOString() ?? null,
        url: r.url,
      })),
      page: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  // ── Contributors ──────────────────────────────────────────────────────────
  async function contributors(ctx: ServiceContext, filters: { repo?: string }) {
    const conn = await requireGithub(db, ctx.userId);
    const synced = await syncedFlag(ctx.userId);
    const base = baseOf(synced);
    const repoClause = filters.repo
      ? Prisma.sql`AND repo_external_id = ${filters.repo}`
      : Prisma.empty;

    const distinctRows = await db.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT login)::int AS count FROM github_contributors
      WHERE user_id = ${ctx.userId}::uuid ${repoClause}`;
    const distinct = distinctRows[0]?.count ?? 0;

    const byRepoRows = await db.$queryRaw<{ key: string; label: string; count: number }[]>`
      SELECT repo_external_id AS key, repo_full_name AS label, COUNT(DISTINCT login)::int AS count
      FROM github_contributors
      WHERE user_id = ${ctx.userId}::uuid ${repoClause}
      GROUP BY 1, 2 ORDER BY count DESC LIMIT 15`;

    const activityRows = await db.$queryRaw<{ key: string; count: number }[]>`
      SELECT login AS key, SUM(contributions)::int AS count
      FROM github_contributors
      WHERE user_id = ${ctx.userId}::uuid ${repoClause}
      GROUP BY 1 ORDER BY count DESC LIMIT 15`;

    const byRepo = byRepoRows.map((r) => ({ key: r.key, label: r.label, value: r.count }));
    const activity = activityRows.map((r) => ({ key: r.key, label: r.key, value: r.count }));

    return {
      calculatedAt: now().toISOString(),
      synced,
      authenticatedLogin: conn.accountLogin,
      total: metricResult("github.contributors", base(distinct)),
      byRepository: metricResult(
        "github.contributors_by_repository",
        base(distinct, { breakdown: byRepo }),
      ),
      activity: metricResult(
        "github.contributor_activity",
        base(
          activity.reduce((s, b) => s + b.value, 0),
          { breakdown: activity },
        ),
      ),
    };
  }

  async function contributorList(
    ctx: ServiceContext,
    query: { repo?: string; page?: number; pageSize?: number },
  ) {
    await requireGithub(db, ctx.userId);
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 25, 1), 100);
    const where: Prisma.GitHubContributorWhereInput = { userId: ctx.userId };
    if (query.repo) where.repoExternalId = query.repo;
    const [rows, total] = await Promise.all([
      db.gitHubContributor.findMany({
        where,
        orderBy: [{ contributions: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.gitHubContributor.count({ where }),
    ]);
    return {
      data: rows.map((r) => ({
        login: r.login,
        contributions: r.contributions,
        repoFullName: r.repoFullName,
        repoExternalId: r.repoExternalId,
        url: r.url,
      })),
      page: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  // ── Activity timeline (unified, derived from the projections — no duplicate store) ─────────
  function activityUnion(userId: string, opts: { repo?: string; type?: string }): Prisma.Sql {
    const repoClause = opts.repo ? Prisma.sql`AND repo_external_id = ${opts.repo}` : Prisma.empty;
    const parts: Prisma.Sql[] = [];
    const want = (t: string) => !opts.type || opts.type === "all" || opts.type === t;
    if (want("commit"))
      parts.push(Prisma.sql`
        SELECT 'commit' AS event_type, repo_external_id, repo_full_name, authored_at AS ts,
               url, LEFT(COALESCE(message,''), 140) AS title, author_login AS actor
        FROM github_commits WHERE user_id = ${userId}::uuid AND authored_at IS NOT NULL ${repoClause}`);
    if (want("pull_request")) {
      parts.push(Prisma.sql`
        SELECT 'pull_request_opened' AS event_type, repo_external_id, repo_full_name, gh_created_at AS ts,
               url, title, author_login AS actor
        FROM github_pull_requests WHERE user_id = ${userId}::uuid AND gh_created_at IS NOT NULL ${repoClause}`);
      parts.push(Prisma.sql`
        SELECT 'pull_request_merged' AS event_type, repo_external_id, repo_full_name, merged_at AS ts,
               url, title, author_login AS actor
        FROM github_pull_requests WHERE user_id = ${userId}::uuid AND merged_at IS NOT NULL ${repoClause}`);
      parts.push(Prisma.sql`
        SELECT 'pull_request_closed' AS event_type, repo_external_id, repo_full_name, closed_at AS ts,
               url, title, author_login AS actor
        FROM github_pull_requests WHERE user_id = ${userId}::uuid AND closed_at IS NOT NULL AND merged = false ${repoClause}`);
    }
    if (want("issue")) {
      parts.push(Prisma.sql`
        SELECT 'issue_opened' AS event_type, repo_external_id, repo_full_name, gh_created_at AS ts,
               url, title, author_login AS actor
        FROM github_issues WHERE user_id = ${userId}::uuid AND gh_created_at IS NOT NULL ${repoClause}`);
      parts.push(Prisma.sql`
        SELECT 'issue_closed' AS event_type, repo_external_id, repo_full_name, closed_at AS ts,
               url, title, author_login AS actor
        FROM github_issues WHERE user_id = ${userId}::uuid AND closed_at IS NOT NULL ${repoClause}`);
    }
    if (want("release"))
      parts.push(Prisma.sql`
        SELECT 'release' AS event_type, repo_external_id, repo_full_name, published_at AS ts,
               url, COALESCE(name, tag_name) AS title, author_login AS actor
        FROM github_releases WHERE user_id = ${userId}::uuid AND published_at IS NOT NULL AND draft = false ${repoClause}`);
    if (parts.length === 0)
      return Prisma.sql`SELECT NULL::text AS event_type, NULL::text AS repo_external_id, NULL::text AS repo_full_name, NULL::timestamptz AS ts, NULL::text AS url, NULL::text AS title, NULL::text AS actor WHERE false`;
    return parts.reduce((acc, p, i) => (i === 0 ? p : Prisma.sql`${acc} UNION ALL ${p}`));
  }

  async function activity(
    ctx: ServiceContext,
    filters: RangeFilters & { repo?: string; type?: string; page?: number; pageSize?: number },
  ) {
    await requireGithub(db, ctx.userId);
    const period = periodOf(filters);
    const periodDto = toPeriodDto(period);
    const synced = await syncedFlag(ctx.userId);
    const base = baseOf(synced);
    const union = activityUnion(ctx.userId, { repo: filters.repo, type: filters.type });
    const win = windowSql(Prisma.sql`ts`, period);
    const { unit, fmt } = trendUnit(period);

    const page = Math.max(filters.page ?? 1, 1);
    const pageSize = Math.min(Math.max(filters.pageSize ?? 30, 1), 100);

    const [countRows, trendRows, byRepoRows, listRows, totalRows] = await Promise.all([
      db.$queryRaw<
        { count: number }[]
      >`SELECT COUNT(*)::int AS count FROM (${union}) e WHERE ts IS NOT NULL ${win}`,
      db.$queryRaw<{ bucket: string; count: number }[]>`
        SELECT to_char(date_trunc(${unit}, ts), ${fmt}) AS bucket, COUNT(*)::int AS count
        FROM (${union}) e WHERE ts IS NOT NULL ${win} GROUP BY 1 ORDER BY 1`,
      db.$queryRaw<{ key: string; label: string; count: number }[]>`
        SELECT repo_external_id AS key, repo_full_name AS label, COUNT(*)::int AS count
        FROM (${union}) e WHERE ts IS NOT NULL ${win} GROUP BY 1, 2 ORDER BY count DESC LIMIT 15`,
      db.$queryRaw<
        {
          event_type: string;
          repo_external_id: string;
          repo_full_name: string;
          ts: Date;
          url: string | null;
          title: string | null;
          actor: string | null;
        }[]
      >`
        SELECT * FROM (${union}) e WHERE ts IS NOT NULL ${win}
        ORDER BY ts DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      db.$queryRaw<
        { count: number }[]
      >`SELECT COUNT(*)::int AS count FROM (${union}) e WHERE ts IS NOT NULL ${win}`,
    ]);

    const total = totalRows[0]?.count ?? 0;
    const trend = trendRows
      .slice(-120)
      .map((r) => ({ key: r.bucket, label: r.bucket, value: r.count }));
    const byRepo = byRepoRows.map((r) => ({ key: r.key, label: r.label, value: r.count }));

    return {
      calculatedAt: now().toISOString(),
      synced,
      period: periodDto,
      total: metricResult("github.activity", base(countRows[0]?.count ?? 0, { period: periodDto })),
      trend: metricResult(
        "github.activity_trend",
        base(
          trend.reduce((s, b) => s + b.value, 0),
          { period: periodDto, breakdown: trend },
        ),
      ),
      byRepository: metricResult(
        "github.activity_by_repository",
        base(
          byRepo.reduce((s, b) => s + b.value, 0),
          { period: periodDto, breakdown: byRepo },
        ),
      ),
      events: listRows.map((r) => ({
        type: r.event_type,
        repoFullName: r.repo_full_name,
        repoExternalId: r.repo_external_id,
        timestamp: r.ts?.toISOString() ?? null,
        title: r.title,
        actor: r.actor,
        url: r.url,
      })),
      page: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  // ── Commit distributions + heatmap ──────────────────────────────────────────
  async function commitDistribution(ctx: ServiceContext, filters: RangeFilters) {
    await requireGithub(db, ctx.userId);
    const period = periodOf(filters);
    const periodDto = toPeriodDto(period);
    const synced = await syncedFlag(ctx.userId);
    const base = baseOf(synced);
    const win = windowSql(Prisma.sql`authored_at`, period);

    const [dowRows, hourRows, authorRows, dayRows, heatRows] = await Promise.all([
      db.$queryRaw<{ dow: number; count: number }[]>`
        SELECT EXTRACT(DOW FROM authored_at AT TIME ZONE 'UTC')::int AS dow, COUNT(*)::int AS count
        FROM github_commits WHERE user_id = ${ctx.userId}::uuid AND authored_at IS NOT NULL ${win} GROUP BY 1`,
      db.$queryRaw<{ hour: number; count: number }[]>`
        SELECT EXTRACT(HOUR FROM authored_at AT TIME ZONE 'UTC')::int AS hour, COUNT(*)::int AS count
        FROM github_commits WHERE user_id = ${ctx.userId}::uuid AND authored_at IS NOT NULL ${win} GROUP BY 1`,
      db.$queryRaw<{ key: string; count: number }[]>`
        SELECT COALESCE(author_login, '(unknown)') AS key, COUNT(*)::int AS count
        FROM github_commits WHERE user_id = ${ctx.userId}::uuid AND authored_at IS NOT NULL ${win}
        GROUP BY 1 ORDER BY count DESC LIMIT 15`,
      db.$queryRaw<{ day: string }[]>`
        SELECT DISTINCT to_char(date_trunc('day', authored_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day
        FROM github_commits WHERE user_id = ${ctx.userId}::uuid AND authored_at IS NOT NULL ${win} ORDER BY 1`,
      db.$queryRaw<{ day: string; count: number }[]>`
        SELECT to_char(date_trunc('day', authored_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
        FROM github_commits WHERE user_id = ${ctx.userId}::uuid AND authored_at IS NOT NULL ${win} GROUP BY 1 ORDER BY 1`,
    ]);

    const byDow: DistributionBucket[] = Array.from({ length: 7 }, (_, i) => ({
      key: String(i),
      label: DOW_LABELS[i]!,
      value: dowRows.find((r) => r.dow === i)?.count ?? 0,
    }));
    const byHour: DistributionBucket[] = Array.from({ length: 24 }, (_, h) => ({
      key: String(h),
      label: `${String(h).padStart(2, "0")}:00`,
      value: hourRows.find((r) => r.hour === h)?.count ?? 0,
    }));
    const byAuthor = authorRows.map((r) => ({ key: r.key, label: r.key, value: r.count }));

    // Longest gap in days between consecutive active commit days.
    const days = dayRows.map((r) => new Date(`${r.day}T00:00:00Z`).getTime());
    let longestGap = 0;
    for (let i = 1; i < days.length; i++) {
      const gap = Math.round((days[i]! - days[i - 1]!) / DAY);
      if (gap > longestGap) longestGap = gap;
    }
    const heat = heatRows.map((r) => ({ key: r.day, label: r.day, value: r.count }));
    const maxHeat = heat.reduce((m, b) => Math.max(m, b.value), 0);

    return {
      calculatedAt: now().toISOString(),
      synced,
      period: periodDto,
      byDayOfWeek: metricResult(
        "github.commits_by_day_of_week",
        base(
          byDow.reduce((s, b) => s + b.value, 0),
          { period: periodDto, breakdown: byDow },
        ),
      ),
      byHour: metricResult(
        "github.commits_by_hour",
        base(
          byHour.reduce((s, b) => s + b.value, 0),
          { period: periodDto, breakdown: byHour },
        ),
      ),
      byAuthor: metricResult(
        "github.commits_by_author",
        base(
          byAuthor.reduce((s, b) => s + b.value, 0),
          { period: periodDto, breakdown: byAuthor },
        ),
      ),
      longestGap: metricResult(
        "github.commit_longest_gap",
        base(longestGap, {
          period: periodDto,
          insufficientReason:
            days.length < 2 ? "Fewer than two active commit days in this period." : null,
        }),
      ),
      heatmap: metricResult(
        "github.activity_heatmap",
        base(
          heat.reduce((s, b) => s + b.value, 0),
          { period: periodDto, breakdown: heat },
        ),
      ),
      heatmapMax: maxHeat,
    };
  }

  // ── Personal activity (authenticated GitHub account) ─────────────────────────
  async function personalActivity(ctx: ServiceContext, filters: RangeFilters) {
    const conn = await requireGithub(db, ctx.userId);
    const login = conn.accountLogin;
    const period = periodOf(filters);
    const periodDto = toPeriodDto(period);
    const synced = await syncedFlag(ctx.userId);
    const base = baseOf(synced);
    const upper = periodUpperBound(period);
    const inPeriod: Prisma.DateTimeNullableFilter =
      period.start && upper ? { gte: period.start, lt: upper } : { not: null };

    if (!login) {
      return {
        calculatedAt: now().toISOString(),
        synced,
        period: periodDto,
        login: null,
        available: false,
      };
    }
    const win = windowSql(Prisma.sql`authored_at`, period);
    const [commits, prs, issuesOpened, repoDays] = await Promise.all([
      db.gitHubCommit.count({
        where: { userId: ctx.userId, authorLogin: login, authoredAt: inPeriod },
      }),
      db.gitHubPullRequest.count({
        where: { userId: ctx.userId, authorLogin: login, ghCreatedAt: inPeriod },
      }),
      db.gitHubIssue.count({
        where: { userId: ctx.userId, authorLogin: login, ghCreatedAt: inPeriod },
      }),
      db.$queryRaw<{ repos: number; active_days: number }[]>`
        SELECT COUNT(DISTINCT repo_external_id)::int AS repos,
               COUNT(DISTINCT date_trunc('day', authored_at AT TIME ZONE 'UTC'))::int AS active_days
        FROM github_commits WHERE user_id = ${ctx.userId}::uuid AND author_login = ${login} AND authored_at IS NOT NULL ${win}`,
    ]);
    const rd = repoDays[0] ?? { repos: 0, active_days: 0 };
    const trendRows = await db.$queryRaw<{ bucket: string; count: number }[]>`
      SELECT to_char(date_trunc(${trendUnit(period).unit}, authored_at AT TIME ZONE 'UTC'), ${trendUnit(period).fmt}) AS bucket, COUNT(*)::int AS count
      FROM github_commits WHERE user_id = ${ctx.userId}::uuid AND author_login = ${login} AND authored_at IS NOT NULL ${win}
      GROUP BY 1 ORDER BY 1`;
    const trend = trendRows
      .slice(-120)
      .map((r) => ({ key: r.bucket, label: r.bucket, value: r.count }));

    return {
      calculatedAt: now().toISOString(),
      synced,
      available: true,
      login,
      period: periodDto,
      commits: metricResult("github.personal_commits", base(commits, { period: periodDto })),
      pullRequests: metricResult("github.personal_pull_requests", base(prs, { period: periodDto })),
      issues: metricResult("github.personal_issues", base(issuesOpened, { period: periodDto })),
      repositories: metricResult(
        "github.personal_repositories",
        base(rd.repos, { period: periodDto }),
      ),
      activeDays: metricResult(
        "github.personal_active_days",
        base(rd.active_days, { period: periodDto }),
      ),
      commitTrend: trend,
    };
  }

  // ── Cross-repository comparison (transparent, no combined score) ─────────────
  async function comparison(ctx: ServiceContext, filters: RangeFilters & { repoIds: string[] }) {
    await requireGithub(db, ctx.userId);
    const period = periodOf(filters);
    const periodDto = toPeriodDto(period);
    const ids = [...new Set(filters.repoIds)].slice(0, 6);
    const repos = await cachedRepos(db, ctx.userId);
    const byId = new Map(repos.map((r) => [r.externalId, r]));
    const upper = periodUpperBound(period);
    const inPeriod = period.start && upper ? { gte: period.start, lt: upper } : undefined;

    const rows = await Promise.all(
      ids.map(async (id) => {
        const commitWin = windowSql(Prisma.sql`authored_at`, period);
        const [commitAgg, prsOpened, prsMerged, issuesOpened, releasesN, contributorsN] =
          await Promise.all([
            db.$queryRaw<
              {
                commits: number;
                active_days: number;
                additions: number | null;
                deletions: number | null;
                last: Date | null;
              }[]
            >`
            SELECT COUNT(*)::int AS commits,
                   COUNT(DISTINCT date_trunc('day', authored_at AT TIME ZONE 'UTC'))::int AS active_days,
                   SUM(additions)::int AS additions, SUM(deletions)::int AS deletions,
                   MAX(authored_at) AS last
            FROM github_commits WHERE user_id = ${ctx.userId}::uuid AND repo_external_id = ${id} AND authored_at IS NOT NULL ${commitWin}`,
            db.gitHubPullRequest.count({
              where: {
                userId: ctx.userId,
                repoExternalId: id,
                ...(inPeriod ? { ghCreatedAt: inPeriod } : {}),
              },
            }),
            db.gitHubPullRequest.count({
              where: {
                userId: ctx.userId,
                repoExternalId: id,
                ...(inPeriod ? { mergedAt: inPeriod } : { mergedAt: { not: null } }),
              },
            }),
            db.gitHubIssue.count({
              where: {
                userId: ctx.userId,
                repoExternalId: id,
                ...(inPeriod ? { ghCreatedAt: inPeriod } : {}),
              },
            }),
            db.gitHubRelease.count({
              where: {
                userId: ctx.userId,
                repoExternalId: id,
                draft: false,
                ...(inPeriod ? { publishedAt: inPeriod } : {}),
              },
            }),
            db.gitHubContributor.count({ where: { userId: ctx.userId, repoExternalId: id } }),
          ]);
        const c = commitAgg[0] ?? {
          commits: 0,
          active_days: 0,
          additions: null,
          deletions: null,
          last: null,
        };
        const meta = byId.get(id);
        return {
          externalId: id,
          fullName: meta?.fullName ?? id,
          commits: c.commits,
          activeDays: c.active_days,
          pullRequests: prsOpened,
          mergedPullRequests: prsMerged,
          issues: issuesOpened,
          releases: releasesN,
          contributors: contributorsN,
          additions: c.additions,
          deletions: c.deletions,
          lastActivity: c.last ? c.last.toISOString() : (meta?.pushedDate ?? null),
        };
      }),
    );

    return { calculatedAt: now().toISOString(), period: periodDto, repositories: rows };
  }

  // ── Synchronization status / completeness ────────────────────────────────────
  async function syncStatus(ctx: ServiceContext) {
    const conn = await requireGithub(db, ctx.userId);
    const states = await db.integrationSyncState.findMany({
      where: { userId: ctx.userId, connectionId: conn.id },
      orderBy: { resourceType: "asc" },
    });
    const resources = states.map((s) => {
      let pending: number | null = null;
      let total: number | null = null;
      try {
        if (s.cursor) {
          const parsed = JSON.parse(s.cursor) as { pending?: number; total?: number };
          pending = typeof parsed.pending === "number" ? parsed.pending : null;
          total = typeof parsed.total === "number" ? parsed.total : null;
        }
      } catch {
        /* cursor is opaque; ignore */
      }
      return {
        resourceType: s.resourceType,
        status: s.status,
        startedAt: s.startedAt?.toISOString() ?? null,
        completedAt: s.completedAt?.toISOString() ?? null,
        recordsFetched: s.recordsFetched,
        recordsUpdated: s.recordsUpdated,
        recordsFailed: s.recordsFailed,
        pendingRepositories: pending,
        totalRepositories: total,
        lastError: s.lastError,
      };
    });
    const anyPartial = states.some((s) => s.status === "partial");
    const anyFailed = states.some((s) => s.status === "failed");
    const anyRunning = states.some((s) => s.status === "running");
    const completeness =
      states.length === 0
        ? "not_synchronized"
        : anyFailed
          ? "error"
          : anyRunning
            ? "running"
            : anyPartial
              ? "partial"
              : "complete";
    return {
      connection: {
        status: conn.status,
        lastSyncAt: conn.lastSyncAt?.toISOString() ?? null,
        lastAttemptedSyncAt: conn.lastAttemptedSyncAt?.toISOString() ?? null,
        accountLogin: conn.accountLogin,
      },
      completeness,
      resources,
    };
  }

  // ── Shared small aggregations ────────────────────────────────────────────────
  async function trendOf(
    table: Prisma.Sql,
    tsColumn: Prisma.Sql,
    userId: string,
    period: Period,
    repo: string | undefined,
    extra: Prisma.Sql = Prisma.empty,
  ): Promise<DistributionBucket[]> {
    const { unit, fmt } = trendUnit(period);
    const repoClause = repo ? Prisma.sql`AND repo_external_id = ${repo}` : Prisma.empty;
    const rows = await db.$queryRaw<{ bucket: string; count: number }[]>`
      SELECT to_char(date_trunc(${unit}, ${tsColumn}), ${fmt}) AS bucket, COUNT(*)::int AS count
      FROM ${table}
      WHERE user_id = ${userId}::uuid AND ${tsColumn} IS NOT NULL ${extra} ${repoClause} ${windowSql(tsColumn, period)}
      GROUP BY 1 ORDER BY 1`;
    return rows.slice(-120).map((r) => ({ key: r.bucket, label: r.bucket, value: r.count }));
  }

  async function byRepoOf(
    table: Prisma.Sql,
    tsColumn: Prisma.Sql,
    userId: string,
    period: Period,
    repo: string | undefined,
    extra: Prisma.Sql = Prisma.empty,
  ): Promise<DistributionBucket[]> {
    const repoClause = repo ? Prisma.sql`AND repo_external_id = ${repo}` : Prisma.empty;
    const rows = await db.$queryRaw<{ key: string; label: string; count: number }[]>`
      SELECT repo_external_id AS key, repo_full_name AS label, COUNT(*)::int AS count
      FROM ${table}
      WHERE user_id = ${userId}::uuid AND ${tsColumn} IS NOT NULL ${extra} ${repoClause} ${windowSql(tsColumn, period)}
      GROUP BY 1, 2 ORDER BY count DESC LIMIT 15`;
    return rows.map((r) => ({ key: r.key, label: r.label, value: r.count }));
  }

  return {
    pullRequests,
    pullRequestList,
    issues,
    issueList,
    releases,
    releaseList,
    contributors,
    contributorList,
    activity,
    commitDistribution,
    personalActivity,
    comparison,
    syncStatus,
  };
}

export type GitHubInsightsService = ReturnType<typeof createGitHubInsightsService>;
export type { MetricResult };
