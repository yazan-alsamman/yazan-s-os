# ADR 0054 — GitHub Repository Intelligence: projection model, sync, and metrics

**Status:** Accepted · 2026-10-04 · Phase 9.6

## Context

Phase 9.6 makes GitHub a first-class PEOS product area (a dedicated `/github` section with Overview,
Repositories, Analytics and repository detail) on top of the Phase 9.5 integration platform. The
analytics must be fast for accounts with hundreds/thousands of repositories and large commit
histories, without N+1 GitHub calls, and must be evidence-based (observed activity, never a
productivity/quality score).

## Decision

1. **Reuse Phase 9.5, extend it.** The GitHub OAuth connection, token encryption, `github.client`
   (repos/commits/activity) and repo↔project linking are reused unchanged. The only additive change
   to 9.5 code is `open_issues_count` on the repo DTO and a `backHref` prop on the detail component.
2. **Repositories stay in `IntegrationExternalResource`** (9.5 cache); a full sync pages all repos
   (capped at 500) into it. No duplicate repository model.
3. **A commit projection table (`GitHubCommit`).** For cross-repository, time-series aggregation
   (commit trend, active days, commits-by-repo, cadence) the external-resource JSON cache is not
   queryable by date. A dedicated read-model is justified (sync → store → aggregate locally):
   `GitHubCommit(userId, connectionId, repoExternalId, repoFullName, sha, message, authorLogin,
authoredAt, committedAt, additions?, deletions?, url)`, `@@unique([userId, repoExternalId, sha])`
   for idempotent sync, indexed by `(userId, authoredAt)` and `(userId, repoExternalId)`. Additive
   migration; owner-scoped; cascade from the owner.
4. **Explicit, bounded, idempotent sync.** `POST /api/v1/github/sync` pages repositories, then for the
   most-recently-pushed non-archived repos (≤60) fetches commits since a 365-day cutoff (≤300/repo),
   upserting on the unique sha (existing commits are immutable → no duplicates). Sync state is
   recorded per resource type; provider rate limits mark the connection `degraded`. No continuous
   monitoring (that is Phase 13).
5. **Aggregate from the projection, not from GitHub.** Overview/Analytics read the repo cache +
   `GitHubCommit` and aggregate in SQL/JS (two cheap queries + bounded in-memory work). Measured at
   150 repos / 4000 commits: overview ~14 ms, analytics ~12 ms, repository list ~11 ms (medians).
6. **Governed metrics (metric catalogue, new `github` category).** Ten metrics
   (`github.repositories_total/active/by_visibility/by_type/by_activity`, `github.commits`,
   `github.commit_trend`, `github.commits_by_repository`, `github.active_days`,
   `github.language_distribution`), each with source endpoint, formula, UTC date semantics, freshness
   (per explicit sync), availability and caveats, plus drill-downs into the repository explorer /
   analytics. No parallel analytics framework.
7. **Evidence, not scoring.** Rankings are separate and transparent (most commits, most recently
   active, no-recent-activity); no combined/opaque repository score. "Activity" means observed GitHub
   events; inactivity is phrased as "no recent GitHub activity observed", never "abandoned". Code
   additions/deletions are **not** available from the commit-list API in bulk and are surfaced as
   unavailable rather than fabricated.
8. **Missing-data semantics.** Not connected → `INTEGRATION_NOT_CONNECTED`; connected but not synced →
   an explicit "not synchronized" state (metric `no_data`); genuinely zero stays zero; a previous-
   period comparison is offered only with real history before the period.
9. **Security.** GitHub text (descriptions, commit messages, topics) is rendered as escaped React
   text (no `dangerouslySetInnerHTML`), so no sanitizer is needed here (unlike HTML email). All
   queries are owner-scoped; identity is from the session; injected ids are ignored.

## Consequences

PEOS gains a fast, governed, first-class GitHub intelligence area that reconciles with the metric
catalogue and never fabricates data or scores. PRs/issues/releases/contributors, the activity heatmap,
cross-repo comparison, the activity-timeline page and personal-activity view are deferred (each needs
its own adapter/sync/storage) and documented. See [[0052-integration-platform]],
[[0019-metric-catalogue-and-result-contract]], [[0051-engineering-analytics]].
