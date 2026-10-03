# ADR 0028 — Skill freshness (`freshness-v1`) and demonstration trend (`skill-trend-v1`)

**Status:** Accepted · 2026-10-03 · Phase 4

## Context

- **`05`** says "Skill Freshness: Time since a skill was last demonstrated" and "Skill Coverage:
  Percentage of target skills with recent evidence". It defines no thresholds and no meaning for
  "recent".
- **`10`** asks for a freshness calculation and a historical trend.
- **`01` §6** lists "Last used" and "Last demonstrated".

PEOS has no level history. Inventing a progression would violate the no-fabrication principle.

## Decision — freshness-v1

- **Demonstration date** = `COALESCE(SkillEvidence.date, Evidence.date)`. The link date wins,
  because it is the date that evidence demonstrated this skill.
  - `updatedAt`, import time, audit time and the page-load time are never used.
  - Project and certification dates do not establish recency, because the link does not say when
    the skill was used.
- **Today** is the UTC calendar day of the request (`shared/calendar.ts`). A demonstration dated
  after today is ignored for recency and reported as "dated in the future".
- **States:**
  - **fresh** — latest demonstration ≤ 365 days ago, inclusive.
  - **aging** — 366–730 days.
  - **stale** — more than 730 days.
  - **no dated evidence** — evidence is linked but none has a usable date.
  - **no evidence** — nothing is linked.
- **Rationale for 365/730:** the smallest defensible convention is calendar years. One year
  matches an annual review cycle and the "Projects Shipped (365 days)" horizon in `00` §4. Two
  years marks knowledge that is likely to need refreshing. The thresholds are shown in every
  explanation and in the catalogue. Changing them means a new version.
- Freshness is descriptive. It is never used to lower the derived level (ADR 0027) and is never
  phrased as a judgement.
- **Skill Coverage** (`05`) = share of active target skills whose freshness is **fresh**.

## Decision — skill-trend-v1

- **Windows:** A = dated demonstrations in the last 365 days (today inclusive); B = in the 365
  days before that.
- **insufficient history** when any of these holds:
  - fewer than 2 dated demonstrations;
  - no demonstration older than window A;
  - no demonstration at all in A or B (sparse history is not interpolated).
- **Otherwise:** A > B **increasing**, A = B **stable**, A < B **decreasing**.
- The UI labels this **demonstration activity** (more / as many / fewer demonstrations), not
  proficiency. The dossier also shows the real count of dated demonstrations per year (6 years).
  No historical level is reconstructed.

## Alternatives considered

- **Decay functions** (e.g. exponential half-life). These are unexplainable to users and have no
  spec basis.
- **Level-at-year-end history.** Project status and certification links have no history, so such
  a series would be partly fabricated. Rejected.

## Consequences

The boundary tests (365/366/730/731 days, midnight UTC, future dates, sparse history) define the
contract. A user who records more demonstration dates on links gets more precise freshness.
