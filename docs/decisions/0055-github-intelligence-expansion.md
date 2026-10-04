# ADR 0055 — GitHub Intelligence Expansion: PRs, issues, releases, contributors, activity & resumable sync

**Status:** Accepted · 2026-10-04 · Phase 9.7

## Context

Phase 9.6 (ADR 0054) delivered the GitHub product area with repositories, a commit projection and
cross-repository commit analytics, and explicitly deferred pull requests, issues, releases,
contributors, a unified activity timeline, an activity heatmap, cross-repository comparison, richer
commit distributions and personal activity — each needing its own adapter, storage and sync. It also
used a fixed "top-N repositories" sync bound that could silently skip older repositories.

Phase 9.7 completes those deferred capabilities on the same foundation, and upgrades synchronization
from a fixed bound to a fair, resumable, rate-limit-aware strategy, without re-implementing Phase 9.5
or 9.6.

## Decision

1. **Reuse Phase 9.5/9.6, extend it.** The OAuth connection, token encryption, repo cache
   (`IntegrationExternalResource`), per-resource `IntegrationSyncState`, `GitHubCommit`, metric
   catalogue and repo↔project linking are reused unchanged. The client gains read-only
   `pulls/issues/releases/contributors` endpoints; normalization and sync are extended, not replaced.

2. **Four additive projection tables** (owner-scoped, cascade from owner, idempotent upsert keys):
   `GitHubPullRequest` (`@@unique(userId, repoExternalId, number)`), `GitHubIssue`
   (`@@unique(userId, repoExternalId, number)`), `GitHubRelease`
   (`@@unique(userId, repoExternalId, externalId)`) and `GitHubContributor`
   (`@@unique(userId, repoExternalId, login)`). Nullable code-size fields are nullable on purpose —
   the PR _list_ endpoint omits additions/deletions, so they are left null, never fabricated. GitHub
   returns PRs through the issues endpoint; those are excluded at sync time so issue analytics never
   double-count pull requests. Releases are explicit GitHub objects — never inferred from commits or
   tags. Migration `20261004105501_github_intelligence_expansion`.

3. **Fair, resumable, rate-limit-aware sync (not top-N).** One explicit `POST /api/v1/github/sync`
   run synchronizes repositories (all pages, bounded), then commits, PRs, issues, releases and
   contributors. Per resource, repositories are ordered never-synced-first then least-recently-synced
   (so quiet/old repos are never starved), processed up to a per-run repository budget, so repeated
   runs cover everything. Synchronization is **incremental** (per-repo cursor = newest stored
   timestamp; PRs stop paging once caught up to known history; commits/issues use `since`),
   **idempotent** (upsert on provider-native keys), and **rate-limit-aware** (a low/zero remaining
   budget stops the run gracefully and marks the resource `partial` with repositories still pending).
   Transient provider failures get a small bounded retry with backoff. No continuous monitoring
   (Phase 13).

4. **Partial/degraded state is always visible.** Per-resource `IntegrationSyncState` records status
   (running/success/partial/failed), counts and pending-repository totals; `GET /github/sync/status`
   exposes an overall completeness (`complete | partial | running | error | not_synchronized`). The UI
   shows a persistent banner for any non-complete state. Partial data is never reported as complete.

5. **Aggregate from the projections, not from GitHub.** Analytics read the projections and aggregate
   in SQL/JS (no N+1 GitHub calls). All timestamps are aggregated in UTC. Commit distributions cover
   day/day-of-week/hour, author, active days and the longest inactivity gap; the heatmap is an
   explicit **daily commit count** (commits only — PRs/issues/releases are never blended in).

6. **Governed metrics (metric catalogue, `github` category).** All new analytics flow through the
   catalogue (35 new `github.*` keys) with source endpoint, formula, UTC date semantics, freshness,
   availability and caveats. No parallel analytics framework. Ratios (merge rate, issue closure rate)
   and duration (median time-to-merge) are marked insufficient rather than fabricated when the sample
   is too small.

7. **Evidence, not scoring.** Contributor `contributions` is GitHub's own commit attribution, kept as
   transparent evidence, never a ranking or quality score. Cross-repository comparison compares
   repositories metric-by-metric and never emits a combined score. Personal activity reports only
   what synchronized data supports; unsupported metrics are marked unavailable, never zero.

8. **Missing-data semantics (ADR 0019).** Not connected → `INTEGRATION_NOT_CONNECTED`; connected but
   not synced → explicit "not synchronized" (metric `no_data`, value null, never 0); genuinely zero
   stays zero; previous-period comparison only with real history before the period.

9. **Security.** Every query is owner-scoped; identity is from the session; injected ids/owner ids are
   ignored. All GitHub text (titles, messages, labels, release names, logins, descriptions) is
   rendered as escaped React text (no `dangerouslySetInnerHTML`); external links pass through a
   `safeUrl` http(s) guard so untrusted URLs cannot reach the DOM as `javascript:`/`data:`.

## Consequences

PEOS gains complete GitHub intelligence (PRs, issues, releases, contributors, unified activity
timeline, daily-commit heatmap, cross-repository comparison, richer commit distributions and personal
activity) and a synchronization model that scales to many repositories, resumes after rate limits and
never hides incompleteness. Deferred to later phases: live webhook/continuous sync (Phase 13), PR
review/approval analytics and per-commit code-size backfill (not available in bulk from the list
APIs). See [[0054-github-repository-intelligence]], [[0052-integration-platform]],
[[0019-metric-catalogue-and-result-contract]], [[0051-engineering-analytics]].
