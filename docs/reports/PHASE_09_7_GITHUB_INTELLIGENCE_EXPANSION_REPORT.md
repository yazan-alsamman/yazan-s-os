# Phase 9.7 — GitHub Intelligence Expansion — Report

**Date:** 2026-10-04 · **Phase:** 9.7 · **Status:** READY WITH CONDITIONS
**Principle:** _GitHub activity is evidence, not a productivity score. Partial data is never reported as complete._

---

## Recovery context

Phase 9.7 was started in a previous Claude Code session that was interrupted before completion. This
session **resumed** that work rather than restarting it: the repository state was inspected, a
completion matrix was built, the exact stopping point was identified, all existing work was preserved,
and only the missing work was implemented. No models, services, APIs, migrations, metrics or tests
were duplicated or reset.

**Exact stopping point found:** the previous session had completed the entire backend (Prisma schema +
migration, Prisma client regenerated, GitHub client endpoints, normalization, resumable sync service,
analytics/insights service, metric catalogue, query schemas, all API routes, the data hooks and the
shared presentational components in `common.tsx`) and the backend integration test
(`github-intel-97.int.test.ts`). It was interrupted **at the UI page layer**: the section
sub-navigation (`GithubNav`) and shared cards existed but no page actually rendered them — the
`/github/activity`, `/github/pull-requests`, `/github/issues`, `/github/releases`,
`/github/contributors` and `/github/compare` routes did not exist, and ADR 0055 and this report were
missing.

### Already implemented before recovery

- **Schema + migration** `20261004105501_github_intelligence_expansion`: `GitHubPullRequest`,
  `GitHubIssue`, `GitHubRelease`, `GitHubContributor` (migration already applied to the test DB).
- **Client** (`github.client.ts`): `listPullRequests`, `listIssues`, `listReleases`,
  `listContributors` + rate-limit/Link-header parsing.
- **Normalization** (`github.normalize.ts`): PR/issue/release/contributor normalizers (+ PR-vs-issue
  discrimination).
- **Sync** (`github-sync.service.ts`): fair, resumable, incremental, rate-limit-aware, idempotent
  multi-resource sync with per-resource sync state and partial/degraded reporting.
- **Analytics** (`github-insights.service.ts`): PRs, issues, releases, contributors, unified activity
  timeline, commit distributions + heatmap, personal activity, cross-repo comparison, sync status.
- **Metrics** (`metric-catalogue.ts`): 35 new governed `github.*` metrics; drill-downs
  (`drilldown.ts`).
- **API**: `/github/{pull-requests,issues,releases,contributors}` (+ `/list`), `/github/activity`,
  `/github/commit-distribution`, `/github/personal`, `/github/comparison`, `/github/sync/status`.
- **Query schemas** (`integration.schemas.ts`) and **data hooks** + shared cards
  (`use-github.ts`, `common.tsx`).
- **Backend integration test** `tests/integration/github-intel-97.int.test.ts` (12 cases).

### Completed during recovery (this session)

1. **UI pages (the missing layer)** — new client components and routes:
   `/github/activity`, `/github/pull-requests`, `/github/issues`, `/github/releases`,
   `/github/contributors`, `/github/compare`, plus a `/github` **layout** that renders the section
   sub-navigation once for the whole area.
2. **Sync-status visibility** — `SyncStatusBanner` (persistent non-complete banner), `SyncStatusPanel`
   (per-resource detail), `RepoFilter`, `GhToolbar`, and a `safeUrl`/`ExternalLink` http(s) guard for
   untrusted GitHub URLs, added to `common.tsx`.
3. **Typed hooks** — replaced the loosely-typed Phase 9.7 hooks in `use-github.ts` with precise
   response interfaces.
4. **Lint fix** — removed three unused imports left in `github-insights.service.ts`.
5. **E2E + accessibility** — `tests/e2e/phase9_7.spec.ts` (honest not-connected states across all new
   surfaces + axe clean).
6. **Docs** — ADR 0055, the decisions index entry, and this report.

### Still incomplete / deferred (documented, not blocking)

- Live webhook / continuous synchronization (Phase 13).
- PR review/approval analytics; per-commit code-size backfill (not available in bulk from GitHub's
  list APIs — surfaced as unavailable, never fabricated).
- Manual screen-reader testing was **not** performed (only automated axe); noted as a condition.

## Data model

Four additive, owner-scoped projections (cascade from owner), each with idempotent upsert keys:

| Table                  | Unique key                             | Notes                                                                                                    |
| ---------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `github_pull_requests` | `(userId, repoExternalId, number)`     | `state` is GitHub's own; `merged` = closed + merge time; code-size fields nullable (list API omits them) |
| `github_issues`        | `(userId, repoExternalId, number)`     | PRs returned by the issues endpoint are excluded at sync time                                            |
| `github_releases`      | `(userId, repoExternalId, externalId)` | explicit GitHub objects — never inferred from commits/tags                                               |
| `github_contributors`  | `(userId, repoExternalId, login)`      | `contributions` = GitHub attribution, evidence not a score                                               |

Indexed by `(userId, ghCreatedAt|publishedAt)`, `(userId, repoExternalId)` and `(userId, state)` where
relevant. Per-resource sync state reuses the Phase 9.5 `IntegrationSyncState`. `prisma validate` passes.

## Synchronization

`POST /api/v1/github/sync` — one explicit run synchronizes repositories (all pages, bounded), then
commits, PRs, issues, releases and contributors.

- **Pagination**: Link-header paging with per-run, per-resource page caps.
- **Fair coverage (not top-N)**: repositories ordered never-synced-first, then least-recently-synced,
  bounded by a per-run repository budget, so repeated runs cover everything; old/quiet repos are never
  starved.
- **Incremental**: per-repo cursor = newest stored timestamp; PRs stop paging once caught up; commits
  and issues use GitHub's `since`.
- **Idempotent**: upsert on provider-native keys → no duplicates (verified: a second sync with one new
  PR adds exactly one row, commits unchanged).
- **Rate limits**: a low/zero remaining budget stops the run gracefully, marks the resource `partial`
  with pending repositories recorded, and the connection `degraded`; transient failures get bounded
  retry with backoff.
- **Partial state always visible**: `GET /github/sync/status` returns completeness
  (`complete | partial | running | error | not_synchronized`); the UI shows a persistent banner for any
  non-complete state.

## Metrics

35 new governed `github.*` metrics added to the catalogue (PR opened/merged/open/merge-rate/
time-to-merge/trend/by-repo/by-state; issue opened/closed/open/closure-rate/trend/by-repo/by-state/
labels; releases/trend/by-repo; contributors/by-repo/activity; activity/trend/by-repo/heatmap;
commits by day-of-week/hour/author, longest gap; personal commits/PRs/issues/repos/active-days). Each
carries source endpoint, formula, UTC date semantics, freshness, availability and caveats. Ratios and
median time-to-merge are marked insufficient (not fabricated) on small samples.

## APIs

`GET` (all owner-scoped via `defineUserRoute`, rate-limited):
`/github/pull-requests`, `/github/pull-requests/list`, `/github/issues`, `/github/issues/list`,
`/github/releases`, `/github/releases/list`, `/github/contributors`, `/github/contributors/list`,
`/github/activity`, `/github/commit-distribution`, `/github/personal`, `/github/comparison`,
`/github/sync/status`.

## UI

New pages (each a thin server `page.tsx` + `PageHeader` + a client component), unified under a
`/github` layout that renders the **GitHub sections** sub-nav:

- **Activity** — unified timeline (filter by type/repo), activity trend, by-repository, daily-commit
  heatmap (keyboard-accessible cells + data-table alternative), commit distributions (day-of-week,
  hour, author, longest inactivity gap), and personal activity KPIs.
- **Pull Requests** — KPIs (opened/merged/open/merge-rate/time-to-merge), by-state, trend, by-repo,
  paginated list with a state filter.
- **Issues** — KPIs (opened/closed/open/closure-rate), by-state, top labels, trend, by-repo,
  paginated list.
- **Releases** — count, stable/pre-release split, repository coverage, latest release, trend, by-repo,
  paginated list.
- **Contributors** — distinct contributors, by-repo, GitHub attribution, paginated table (the
  authenticated account is distinguished from repository contributors).
- **Compare** — pick 2–6 repositories; a metric-by-metric table (no combined score).

Reuses the existing design system (`ChartCard`, `KpiCard`, `EChart`, metric-definition popovers,
drill-downs). No fake data: not connected → "GitHub is not connected."; connected but not synced →
"not synchronized"; partial → a persistent "Partially synchronized" banner.

## Security

Owner isolation verified for PRs, issues, releases, contributors, commit analytics and activity
(User B sees no User A data; injected ids/owner ids ignored; identity from session). Untrusted GitHub
text is rendered as escaped React text (no `dangerouslySetInnerHTML`); external links pass a `safeUrl`
http(s) guard. Not-connected/anonymous access returns `INTEGRATION_NOT_CONNECTED`.

## Tests — exact commands and results

- `npx vitest run --project unit` → **34 files, 307 tests passed**.
- `npx vitest run --project integration` → **30 files, 220 tests passed** (includes
  `github-intel-97.int.test.ts`: sync of all resource types, PR exclusion from issues, PR/issue/
  release/contributor analytics, unified timeline, UTC commit distributions, personal activity,
  transparent comparison, incremental + idempotent sync, partial-sync-under-rate-limit, owner
  isolation).
- `npx playwright test phase9_7 phase9_6` → **4 passed** (honest not-connected states across all new
  GitHub surfaces + sub-navigation; **axe: no violations**).
- `npm run lint` → **0 problems**. `npm run typecheck` → **0 errors**. `npm run build` → **success**
  (all six new routes present, dynamic). `npx prisma validate` → **valid**.

## Accessibility

Automated: `expectNoAxeViolations` passes on the new GitHub surfaces (Playdwright + axe). Heatmap cells
are keyboard-focusable with per-cell `aria-label` and a full data-table alternative (Playwright + axe);
distribution/trend charts carry `aria-label` summaries and table fallbacks; tables use `scope` headers
and captions.
**Manual screen-reader testing was not performed** (condition for final acceptance).

## Performance

Analytics aggregate from the local projections (no N+1 GitHub calls on page load); list endpoints are
server-paginated (≤100/page); projection tables are indexed on the owner + filter/sort columns; sync is
incremental and bounded per run. No formal benchmark was captured this session (the Phase 9.6 commit
analytics benchmark remains representative of the aggregation path).

## Limitations

- Live/continuous sync, PR review/approval analytics and per-commit code-size backfill are deferred.
- Manual screen-reader pass and a fresh performance benchmark are outstanding.

## Final status

**PHASE 9.7 — READY WITH CONDITIONS.** All in-scope capabilities are implemented, governed, tested and
accessible (automated); conditions are the outstanding manual screen-reader pass and a refreshed
performance benchmark. See [[0055-github-intelligence-expansion]].
