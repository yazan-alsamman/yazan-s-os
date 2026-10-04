# Phase 9.6 — GitHub Repository Intelligence — Report

**Date:** 2026-10-04 · **Phase:** 9.6 · **Status:** Core complete (PRs/Issues/Releases/heatmap/etc. deferred)
**Principle:** _GitHub activity is evidence, not a productivity score._

---

## Scope & relationship to Phase 9.5

Phase 9.5 (Integration Platform) is unchanged and remains the foundation. Phase 9.6 **extends** it with
a first-class GitHub Repository Intelligence product area at `/github`. It reuses the 9.5 GitHub OAuth
connection, token encryption, `github.client` and repo↔project linking. The only additive changes to
9.5 code are `open_issues_count` on the repo DTO and an optional `backHref` prop on the detail
component (both backward-compatible). Agreed session scope: **GitHub Intelligence core** (Overview,
Repositories explorer, Repository detail, Analytics, commit sync + metrics); PRs/Issues/Releases,
contributors, activity heatmap, cross-repo comparison, the activity-timeline page and personal-activity
view are **deferred** (documented below).

## Architecture

Dedicated top-level nav **GitHub** → `/github` (Overview), `/github/repositories`,
`/github/repositories/:id`, `/github/analytics`. Settings → Integrations keeps connection management.
Flow: **sync → store → aggregate locally** (ADR 0054). Repositories are cached in the 9.5
`IntegrationExternalResource`; commits are stored in a new queryable `GitHubCommit` projection.
Analytics read the projection (two cheap SQL aggregates + bounded in-memory work) — no N+1 GitHub
calls on page load.

## Data model

`GitHubCommit` (additive migration `github_commits`): `userId`, `connectionId`, `repoExternalId`,
`repoFullName`, `sha`, `message?`, `authorLogin?`, `authoredAt?`, `committedAt?`, `additions?`,
`deletions?`, `url?`. `@@unique([userId, repoExternalId, sha])` (idempotent sync), indexed by
`(userId, authoredAt)` and `(userId, repoExternalId)`; CHECK non-negative counts + non-blank sha;
cascade from the owner. No duplicate repository model.

## Synchronization

`POST /api/v1/github/sync` — explicit, bounded, idempotent: pages all repositories (≤500) into the
cache, then for the most-recently-pushed non-archived repos (≤60) fetches commits since a 365-day
cutoff (≤300/repo), upserting on the unique sha (existing commits immutable → no duplicates). Sync
state recorded per resource type (`repository`, `github_commit`); provider 403/429 mark the connection
`degraded`. No continuous monitoring.

## API endpoints

`POST /github/sync`; `GET /github/overview?range=`; `GET /github/analytics?range=`;
`GET /github/repos?q&visibility&type&status&language&activity&sort&page`;
`GET /github/repositories/:id/languages`. Phase 9.5's `/github/repositories`, `/commits`, `/activity`,
`/link` are unchanged. All owner-scoped; `integration` rate limit; `INTEGRATION_NOT_CONNECTED` without a
connection.

## UI routes

`/github` (Overview: KPI cards + visibility/type distributions + sync + freshness), `/github/repositories`
(explorer: search, filters visibility/type/status/language/activity, sort, pagination, facets),
`/github/repositories/:id` (header, provenance, commits, activity, languages, PEOS project links),
`/github/analytics` (commit trend line, commits-by-repo, language/activity/visibility distributions,
rankings). Honest "not connected" / "not synchronized" states throughout.

## Metrics (catalogue additions — new `github` category)

Ten governed metrics (full records in `docs/architecture/metric-catalogue.md`), each with source
endpoint, formula, UTC date semantics, freshness (per explicit sync), availability and caveats, plus
drill-downs: `github.repositories_total`, `github.repositories_active`,
`github.repositories_by_visibility`, `github.repositories_by_type`, `github.repositories_by_activity`,
`github.commits` (with previous-period comparison), `github.commit_trend`,
`github.commits_by_repository`, `github.active_days`, `github.language_distribution`. Catalogue now
**118 metrics, 106 available, 12 unavailable.**

## Charts

Commit trend (line/area), commits-by-repository (horizontal bar), language distribution (bar),
activity-recency distribution (bar), visibility/type distributions (bar). Every chart has a title,
source/definition drawer, data-table alternative, empty/insufficient states, and drill-down. Rankings
are lists (most commits / most recently active / no-recent-activity) — separate and transparent, never
a combined score.

## Data sources, provenance, freshness

Repositories from `/user/repos`; commits from `/repos/:repo/commits`; languages from
`/repos/:repo/languages`. Every externally sourced record carries provenance
(`github:repository:<id>`, `github:commit:<repo>@<sha>`). Freshness (connection `lastSyncAt`) is shown
on every view ("last synchronized …"); the UI distinguishes live fetch vs synced cache and the
not-synchronized state. GitHub remains the source of truth.

## Caching & performance

Measured on the test DB (150 repos / 4,000 commits, 9 runs each): overview(90d) median **13.6 ms**
(p95 82), analytics(90d) median **12.1 ms** (p95 37), repositories(filter+sort) median **10.8 ms**
(p95 12). Two owner-scoped SQL aggregates + bounded in-memory repo work; indexed `(userId, authoredAt)`.

## Security & owner isolation

All queries owner-scoped (`userId` from the session); injected `userId` ignored (tested). GitHub text
(descriptions, commit messages, topics) is rendered as escaped React text — no `dangerouslySetInnerHTML`
for GitHub content, so no HTML injection path. Tokens stay encrypted server-side (9.5). Disconnected/
unconnected → `INTEGRATION_NOT_CONNECTED`. Tested: two-user isolation (Bob sees no repositories/commits);
HTTP 401 anonymous; 409 without connection; injected userId ignored.

## Testing

| Suite                     | Result                                                                                                                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (`vitest`)           | **307 passed** (34 files) — incl. catalogue (118/106) and drill-down coverage for the new metrics                                                                                                                                                                         |
| Integration (`vitest`)    | **208 passed** (29 files) — incl. `github-intel.int.test.ts` (7: sync, idempotency, overview + comparison, analytics aggregation, repo filter/sort/facets, languages, isolation) and `github-intel-authz.int.test.ts` (3: 401, 409 owner-scoped, injected userId ignored) |
| Security                  | token never exposed (9.5 + reused); owner isolation; injected ids ignored; GitHub text escaped                                                                                                                                                                            |
| E2E (`playwright`)        | **117 passed** (115 prior + `phase9_6.spec.ts` 2: top-level GitHub nav + honest not-connected states across `/github`, `/github/repositories`, `/github/analytics`)                                                                                                       |
| Accessibility             | `axe` clean on the GitHub area (automated); manual screen-reader not claimed                                                                                                                                                                                              |
| Typecheck / Lint / Format | **PASS / PASS / PASS**                                                                                                                                                                                                                                                    |
| Build                     | **PASS**                                                                                                                                                                                                                                                                  |
| Migration / Drift         | `migrate status` up to date on `peos` + `peos_test`; **drift 0** (one additive migration)                                                                                                                                                                                 |
| Security audit            | `pnpm audit --prod` — no known vulnerabilities; token-leak grep over the GitHub modules clean                                                                                                                                                                             |

**Exact commands:** `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm format:check`, `pnpm vitest run
--project unit`, `pnpm test:integration`, `pnpm build`, `pnpm exec prisma migrate status`, `pnpm audit
--prod`, `pnpm test:e2e`.

## GitHub API limitations

- **Code additions/deletions** are not in the commit-list response; computing them in bulk would be
  N+1 (per-commit detail). Surfaced as unavailable, never fabricated.
- Repository text search is applied server-side over the **synced** set; a full GitHub code/search API
  was not used. Sync is bounded (≤500 repos, ≤60 repos × ≤300 commits, 365-day window) — documented.

## Deferred capabilities (documented, not implemented)

Pull-request / issue / release analytics (adapters + sync + storage + metrics + UI), contributor
intelligence, personal-GitHub-activity view, activity heatmap, GitHub-wide activity-timeline page,
cross-repository comparison, commit distribution by hour/day-of-week. Each needs its own GitHub
adapter and sync; none fabricated.

## Live validation

**Not performed in this environment** (no GitHub OAuth app connected here; CI uses a mock adapter).
The owner's GitHub connect (Settings → Integrations) + a Sync enables live data. All automated tests
use deterministic fixtures / mock adapters; no fake data exists in the production UI.

## Migration & ADRs

One additive migration (`github_commits`). ADR **0054** (GitHub Repository Intelligence). Metric
catalogue doc regenerated (118 metrics). api / INTEGRATIONS / security-baseline / DEVELOPMENT / spec
index updated.

## Regression & verdict

Phases 0–9.5 remain green (307 unit, 208 integration, 117 E2E). Phase 9.5 behaviour unchanged (only
additive/compatible edits). One pre-existing "h1 not found" E2E flake did not recur this run.

**Verdict: READY WITH CONDITIONS** — the GitHub Intelligence core is implemented, governed, secured and
mock-tested; live use is conditional on the owner's GitHub connection + sync, and PRs/Issues/Releases
and the other items above are deferred. STOP — awaiting owner review before any further phase.
