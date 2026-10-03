# ADR 0033 — Goal progress, target attainment and risk (`goal-attainment-v1`, `goal-risk-v1`)

**Status:** Accepted · 2026-10-03 · Phase 5

## Context

- **`05` Goal Metrics** names on-track goals, at-risk goals, overdue goals, completion rate,
  target attainment and Goal Burndown, without formulas.
- **`04` Goal** has `baseline`, `target`, `metric` and a `confidence` field.
- The absolute rules forbid fabricated progress, unexplained percentages, opaque scores, invented
  weighting and turning missing data into zero.

## Decision

1. **No composite progress score.** Three progress views are shown **side by side and never
   combined**:
   - **Target attainment (derived)** from measurements;
   - **Milestone progress (derived)** from linked milestones: completed ÷ non-cancelled linked
     milestones, with overdue and blocked counts;
   - **Confidence (manual)**: the user's own low / medium / high, shown as entered and never used
     in any calculation.
2. **Typed target.** A goal's target is `metric` (text), `unit` (text), `baseline` and `target`
   (finite numbers). Both numbers are optional; without them attainment is not computable.
3. **`goal-attainment-v1`:**

   ```
   progress = (latest − baseline) / (target − baseline)
   ```

   - `latest` is the most recent measurement dated today or earlier (ties: latest created).
   - Direction comes from the sign of `target − baseline`, so "lower is better" metrics (latency,
     cost) work without a flag.
   - States: `attained` (progress ≥ 1), `in_progress` (0 ≤ progress < 1), `regressed`
     (progress < 0), `not_computable` (no baseline or target, target = baseline, or no
     measurement). Not computable is **never** shown as 0 % or 100 %.
   - Progress is not clamped in the data; the UI shows the percentage with its explanation
     ("Latest 150 ms on 2026-09-01: 50 % of the way from 200 ms to 100 ms").

4. **`goal-risk-v1`.** Risk is assessed for **open** goals only. An open goal is **at risk** when
   at least one real signal is present; the signals are listed, never weighted or scored:
   - `overdue` — the goal's deadline has passed;
   - `overdue_milestones` — linked milestones past their planned date (Phase 3 rule);
   - `blocked_milestones` — linked milestones with status blocked;
   - `project_health` — contributing projects whose **manual** health is at risk or blocked
     (non-archived);
   - `skill_gaps` — linked skills with a Phase 4 **critical** gap;
   - `dependencies` — dependencies that are cancelled or overdue;
   - `regressed` — the latest measurement is worse than the baseline.

   An open goal with no signal is **on track** only when it has at least one assessable input
   (a deadline, linked milestones, projects, skills or dependencies, or a recorded measurement);
   otherwise it is **not assessable** — "no signal" is not evidence of being on track. Drafts,
   completed and cancelled goals are **not applicable**.

5. **Manual vs derived.** Manual values (status, completion, confidence, project manual health)
   are never overwritten by derived ones, and derived values never read confidence. Derived
   values are computed on request and never stored.
6. **Health** uses real signals only; there is no computed goal health score.

## Alternatives considered

- **Weighted progress (e.g. 50 % attainment + 50 % milestones).** Invented weighting; rejected.
- **Time-elapsed "expected progress" to flag lagging goals.** Assumes linear progress the spec
  does not define; rejected for v1.
- **Using confidence as a risk input.** Mixes self-assessment into derived risk; rejected.

## Consequences

`goals.target_attainment`, `goals.attainment_distribution`, `goals.at_risk`, `goals.on_track`,
`goals.risk_distribution`, `goals.milestone_progress` and `goals.burndown` are catalogued with
these formulas. A change needs `goal-attainment-v2` / `goal-risk-v2` and a catalogue revision.
