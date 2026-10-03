# ADR 0029 — Skill gap analysis and critical gaps (`gap-analysis-v1`)

**Status:** Accepted · 2026-10-03 · Phase 4

## Context

- **`08`** schedules skill gap analysis.
- **`00` §4** lists "Critical Skill Gaps" in the KPI strip and "Skill gap" in the Attention panel.
- **`05`** describes a Skill Gap Heatmap: rows are skills; columns are current evidence, target,
  freshness and production evidence.

Nothing defines "critical". Missing evidence must not be turned into zero proficiency or a
weakness.

## Decision

1. **Gap.** For a skill with a target ≥ 1 and a derived level, gap = target − level. The state is
   `below_target` (gap > 0), `at_target` (0) or `above_target` (< 0). The other states are:
   - `no_target` — no target, or target 0 ("not evaluated");
   - `not_computable` — a target exists but no level can be derived. These skills are reported as
     **targets without evidence**.
2. **Critical gap.** An **active** skill with a target ≥ 1 and a derived level where either:
   - the level is at least 2 below target, or
   - the level is below target and freshness is `stale`.

   Skills without evidence are **never** critical. The explanation always names the reason ("2
   levels below target" or "below target and the latest demonstration is stale"), the target,
   the derived level with its rule breakdown, the missing requirements for the next level, and
   the last demonstration date.

3. **Source list and reconciliation.** `GET /api/v1/skills/intelligence` is the single source list.
   - Filters: category, active, hasTarget, level, freshness, gap, critical, targetWithoutEvidence,
     trend, productionLinked.
   - Every count and bucket metric is computed with the same predicate (`matchesQuery`) over the
     same analysed rows, so metric = list total exactly. Integration tests assert this.
   - Distributions cover **active** skills; drill-downs add `active=true`.
   - Score-style metrics (derived level, radar) drill to the skill dossier instead (documented
     exception, as in ADR 0025).
4. **Heatmap.** A semantic HTML table, not a canvas.
   - Columns: derived level, target, gap, freshness (with days), production evidence, evidence
     count (with undated count), trend.
   - Every cell carries text. Colour only reinforces the gap and freshness meaning; derived levels
     are uncoloured, because a level is not good or bad.
   - Filters and sort are kept in the URL. Below 768 px the table becomes cards.
5. **Radar.** Plots up to 12 active skills with a derived level: target skills first, then by
   level. Skills without a level are listed by name, not plotted. The target series is drawn only
   when every plotted skill has a target, so a missing target is never drawn. The full data table
   is always available.

## Alternatives considered

- **Criticality weighted by category or importance.** There is no importance field in the spec.
- **Treating no evidence as level 0 (gap = target).** This fabricates a measurement. Rejected.

## Consequences

`skills.critical_gaps` and `skills.coverage` are now available in the Command Center. If the spec
later defines skill importance, `gap-analysis-v2` can use it.
