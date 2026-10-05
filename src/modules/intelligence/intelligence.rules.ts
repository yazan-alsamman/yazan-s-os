import { DAY_MS, utcDay } from "@/modules/shared/calendar";
import { AGING_MAX_DAYS, FRESH_MAX_DAYS } from "@/modules/skills/skill-intelligence";

/**
 * Deterministic continuous-intelligence rules (Phase 13, ADR 0060). Pure functions over real,
 * already-aggregated facts — no AI, no randomness, no I/O. Every classification is explainable and
 * versioned so a signal can be traced to the rule that produced it.
 */
export const INTELLIGENCE_RULES_VERSION = "intel-v1";

export type Severity = "info" | "attention" | "warning" | "critical";

/** Skill-freshness → signal. Reuses the Phase 4 freshness thresholds (freshness-v1). */
export type SkillFreshness = "fresh" | "aging" | "stale" | "insufficient";

export function skillFreshness(latest: Date | null, now: Date): SkillFreshness {
  if (!latest) return "insufficient";
  const days = Math.floor((utcDay(now).getTime() - utcDay(latest).getTime()) / DAY_MS);
  if (days <= FRESH_MAX_DAYS) return "fresh";
  if (days <= AGING_MAX_DAYS) return "aging";
  return "stale";
}

/**
 * A skill only yields a signal when there is a real freshness concern AND the skill is one the owner
 * cares about (active, or with a target). `fresh` never produces a signal. Inactivity is reported as
 * "no recent evidence", never as "skill lost" (severity stays ≤ warning).
 */
export function skillSignal(input: {
  freshness: SkillFreshness;
  qualifyingEvidence: number;
  active: boolean;
  hasTarget: boolean;
}): { type: "skill_stale" | "skill_aging"; severity: Severity } | null {
  if (!input.active && !input.hasTarget) return null;
  if (input.freshness === "stale") {
    // Stale is more serious when the owner set a target for the skill, but never "critical":
    // absence of recent *evidence* is not demonstrated decline.
    return { type: "skill_stale", severity: input.hasTarget ? "warning" : "attention" };
  }
  if (input.freshness === "aging") {
    return { type: "skill_aging", severity: "info" };
  }
  // `insufficient` (no dated demonstration) is informational only when a target exists.
  if (input.freshness === "insufficient" && input.hasTarget && input.qualifyingEvidence === 0) {
    return { type: "skill_stale", severity: "info" };
  }
  return null;
}

/** Days until a deadline (negative = past). Null when there is no deadline. */
export function daysUntil(deadline: Date | null, now: Date): number | null {
  if (!deadline) return null;
  return Math.ceil((utcDay(deadline).getTime() - utcDay(now).getTime()) / DAY_MS);
}

/**
 * Opportunity deadline severity. Only an *active* opportunity (not closed/archived) with required
 * requirements still unmet warrants escalation; a fully-covered opportunity nearing its deadline is
 * informational. `critical` requires an imminent deadline AND an unmet required requirement.
 */
export function deadlineSeverity(input: {
  daysUntil: number | null;
  unmetRequired: number;
  active: boolean;
}): Severity | null {
  const d = input.daysUntil;
  if (d === null || !input.active || d < 0) return null;
  if (d <= 7) return input.unmetRequired > 0 ? "critical" : "attention";
  if (d <= 21) return input.unmetRequired > 0 ? "warning" : "info";
  return null;
}

/** Opportunity evidence-gap severity from the count of unmet *required* requirements. */
export function gapSeverity(unmetRequired: number): Severity | null {
  if (unmetRequired <= 0) return null;
  return unmetRequired >= 3 ? "warning" : "attention";
}

// ── ISO week (Monday 00:00 UTC) helpers for the weekly executive review ──────────────────────────

/** Monday (UTC, date-only) of the week containing `date`. */
export function weekStart(date: Date): Date {
  const d = utcDay(date);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const backToMonday = (dow + 6) % 7;
  return new Date(d.getTime() - backToMonday * DAY_MS);
}

/** [start, endExclusive) for the ISO week containing `date`, and the previous week. */
export function weekWindows(date: Date): {
  start: Date;
  endExclusive: Date;
  prevStart: Date;
  prevEndExclusive: Date;
} {
  const start = weekStart(date);
  const endExclusive = new Date(start.getTime() + 7 * DAY_MS);
  const prevStart = new Date(start.getTime() - 7 * DAY_MS);
  return { start, endExclusive, prevStart, prevEndExclusive: start };
}

/** A change description that never over-claims from a small or zero sample. */
export function describeDelta(current: number, previous: number): "up" | "down" | "flat" {
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "flat";
}

/** Stable dedupe keys so repeated detection updates a signal instead of duplicating it. */
export const dedupeKey = {
  skill: (skillId: string) => `skill:${skillId}`,
  opportunityGap: (opportunityId: string) => `opp-gap:${opportunityId}`,
  opportunityDeadline: (opportunityId: string) => `opp-deadline:${opportunityId}`,
  weekly: (weekStartIso: string) => `weekly:${weekStartIso}`,
};
