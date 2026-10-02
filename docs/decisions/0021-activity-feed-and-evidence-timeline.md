# ADR 0021 — Recent activity from the audit log; evidence timeline by evidence date

**Status:** Accepted · 2026-10-02 · Phase 2

## Context

The Command Center needs a recent-activity feed and an evidence timeline (`01`, `02`). PEOS has
no domain-event table (gap C5). It does have an in-transaction audit log (Phase 1), which records
every create/update/delete/relationship change with before and after snapshots. Those snapshots
can contain free text and authentication metadata (IP addresses, user agents).

## Decision

**Activity** (`src/modules/analytics/activity.service.ts`)

- Source: `audit_logs` where `actor_id` is the session user, newest first, paginated (≤ 50 per
  page), bounded by the dashboard date range.
- `auth.*` events (sign-ins, sessions, user agents) are excluded.
- Raw snapshots are never returned. The DTO is `{id, at, entityType, verb, summary, label, href,
deleted}`. `label` comes only from a per-entity whitelist of name/title fields. For
  relationship-only changes, the label is the record's current name, read with an owner-scoped
  lookup.
- `href` is set only when the record still exists **and** belongs to the caller. This is checked
  with one owner-scoped query per entity type on the page. Records that no longer exist are
  marked `deleted` and are not linked.

**Evidence timeline** (`src/modules/analytics/timeline.service.ts`)

- Ordered by the evidence `date` the user recorded, never by `createdAt`.
- Undated evidence is excluded and reported as a count, with a link to `/evidence?dated=false`.
- Supports the evidence filters and the date range. Shows at most 3 related records per kind, each
  with an owner-scoped link.

## Alternatives considered

- **A new domain-event table.** This would duplicate the audit log and need a migration. The
  audit log is already transactional and complete for Phase 1 entities.
- **Ordering the timeline by `createdAt` when there is no date.** Rejected: it would show the
  import time as the date the work happened.

## Consequences

Activity only covers what the audit log records. If future phases add entities, they must audit
in-transaction and add a label whitelist entry to appear in the feed.
