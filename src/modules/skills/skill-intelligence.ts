import { addDays, daysBetween, utcDay } from "@/modules/shared/calendar";
import { toDateOnly } from "@/modules/shared/fields";

/**
 * Skill intelligence (Phase 4). Pure, versioned, explainable functions over evidence signals that
 * are aggregated from persisted records. Nothing here is stored: every value is recomputed on
 * request (ADR 0027). Every result carries the rule that produced it.
 *
 *   skill-level-v1      — evidence-derived current level (ADR 0027)
 *   freshness-v1        — recency of the latest dated demonstration (ADR 0028)
 *   skill-trend-v1      — demonstration activity, last 12 months vs the 12 before (ADR 0028)
 *   gap-analysis-v1     — target vs derived level, critical gaps (ADR 0029)
 */
export const SKILL_LEVEL_MODEL_VERSION = "skill-level-v1";
export const FRESHNESS_MODEL_VERSION = "freshness-v1";
export const TREND_MODEL_VERSION = "skill-trend-v1";
export const GAP_MODEL_VERSION = "gap-analysis-v1";

/** freshness-v1 thresholds, in whole days since the latest demonstration (inclusive). */
export const FRESH_MAX_DAYS = 365;
export const AGING_MAX_DAYS = 730;
/** skill-trend-v1 window length (days). */
export const TREND_WINDOW_DAYS = 365;

/** Aggregated, persisted facts about one skill. Every number traces to rows (see ADR 0027). */
export interface SkillSignals {
  evidence: {
    /** SkillEvidence links (any strength). */
    total: number;
    /** Links with strength moderate or strong. */
    qualifying: number;
    /** Qualifying links whose evidence is verified. */
    qualifyingVerified: number;
    /** Links with strength strong. */
    strong: number;
    /** Strong links whose evidence is verified. */
    strongVerified: number;
    /** Qualifying links whose evidence type is production_metric. */
    productionMetric: number;
    /** Verified links whose evidence type is testimonial or publication. */
    recognition: number;
  };
  projects: {
    /** ProjectSkill links. */
    total: number;
    /** Linked projects in development/validation/production/maintenance, or with a completion date. */
    delivered: number;
    /** Linked projects in production or maintenance (ADR 0018 production group). */
    production: number;
  };
  certifications: {
    earned: number;
    inProgress: number;
  };
  demonstrations: {
    /** Latest demonstration date ≤ today: COALESCE(SkillEvidence.date, Evidence.date). */
    latest: Date | null;
    earliest: Date | null;
    /** Links with a demonstration date ≤ today. */
    dated: number;
    /** Links without any demonstration date. */
    undated: number;
    /** Links dated after today (ignored for recency). */
    future: number;
    /** Dated demonstrations in the last TREND_WINDOW_DAYS days (today inclusive). */
    recentWindow: number;
    /** Dated demonstrations in the TREND_WINDOW_DAYS days before that. */
    previousWindow: number;
  };
}

export const emptySignals = (): SkillSignals => ({
  evidence: {
    total: 0,
    qualifying: 0,
    qualifyingVerified: 0,
    strong: 0,
    strongVerified: 0,
    productionMetric: 0,
    recognition: 0,
  },
  projects: { total: 0, delivered: 0, production: 0 },
  certifications: { earned: 0, inProgress: 0 },
  demonstrations: {
    latest: null,
    earliest: null,
    dated: 0,
    undated: 0,
    future: 0,
    recentWindow: 0,
    previousWindow: 0,
  },
});

// ── skill-level-v1 ──────────────────────────────────────────────────────────

export interface LevelRequirement {
  /** Human-readable requirement. */
  label: string;
  required: number;
  actual: number;
  met: boolean;
}

export interface LevelRule {
  level: 1 | 2 | 3 | 4 | 5;
  /** "any" = one requirement suffices; "all" = every requirement must hold. */
  mode: "any" | "all";
  requirements: LevelRequirement[];
  met: boolean;
}

/** Production-linked records: production-stage projects plus qualifying production metrics. */
export const productionLinked = (s: SkillSignals) =>
  s.projects.production + s.evidence.productionMetric;

function req(label: string, required: number, actual: number): LevelRequirement {
  return { label, required, actual, met: actual >= required };
}

/**
 * The cumulative ladder. A level is reached only if its own rule AND every lower rule hold, so a
 * certification or project link alone never yields more than "Working knowledge" (2).
 */
export function levelRules(s: SkillSignals): LevelRule[] {
  const e = s.evidence;
  const pe = productionLinked(s);
  const rules: Omit<LevelRule, "met">[] = [
    {
      level: 1,
      mode: "any",
      requirements: [
        req("Evidence linked to the skill", 1, e.total),
        req("Projects linked to the skill", 1, s.projects.total),
        req(
          "Certifications earned or in progress",
          1,
          s.certifications.earned + s.certifications.inProgress,
        ),
      ],
    },
    {
      level: 2,
      mode: "any",
      requirements: [
        req("Evidence of moderate or strong strength", 1, e.qualifying),
        req(
          "Linked projects in delivery (development or later, or completed)",
          1,
          s.projects.delivered,
        ),
        req("Earned certifications", 1, s.certifications.earned),
      ],
    },
    {
      level: 3,
      mode: "all",
      requirements: [
        req("Evidence of moderate or strong strength", 2, e.qualifying),
        req("…of which verified", 1, e.qualifyingVerified),
        req("Linked projects in delivery", 1, s.projects.delivered),
      ],
    },
    {
      level: 4,
      mode: "all",
      requirements: [
        req("Evidence of moderate or strong strength", 3, e.qualifying),
        req("…of which verified", 2, e.qualifyingVerified),
        req("Evidence of strong strength", 1, e.strong),
        req("Production-linked records (production projects or production metrics)", 1, pe),
      ],
    },
    {
      level: 5,
      mode: "all",
      requirements: [
        req("Evidence of moderate or strong strength", 5, e.qualifying),
        req("…of which verified", 3, e.qualifyingVerified),
        req("Verified evidence of strong strength", 2, e.strongVerified),
        req("Production-linked records", 2, pe),
        req(
          "Verified testimonials or publications (recognition of leading others)",
          1,
          e.recognition,
        ),
      ],
    },
  ];
  return rules.map((r) => ({
    ...r,
    met: r.mode === "any" ? r.requirements.some((q) => q.met) : r.requirements.every((q) => q.met),
  }));
}

/**
 * - `derived`             — at least level 1 holds
 * - `insufficient_evidence` — linked records exist, but none qualifies even for level 1
 *                             (e.g. only planned certifications)
 * - `no_evidence`         — nothing is linked to the skill
 */
export type LevelState = "derived" | "insufficient_evidence" | "no_evidence";

export interface DerivedLevel {
  model: typeof SKILL_LEVEL_MODEL_VERSION;
  state: LevelState;
  /** 1–5, or null when no level can be derived. Never 0 (0 = "Not evaluated" is not a finding). */
  level: number | null;
  rules: LevelRule[];
  /** The unmet requirements of the next level, if any. */
  nextLevel: { level: number; missing: LevelRequirement[] } | null;
  explanation: string;
}

export function hasAnyRecord(s: SkillSignals): boolean {
  return (
    s.evidence.total + s.projects.total + s.certifications.earned + s.certifications.inProgress > 0
  );
}

export function deriveLevel(s: SkillSignals, hasLinkedRecords = hasAnyRecord(s)): DerivedLevel {
  const rules = levelRules(s);
  let level = 0;
  for (const rule of rules) {
    if (!rule.met) break;
    level = rule.level;
  }
  const next = rules.find((r) => r.level === level + 1);
  const nextLevel = next
    ? {
        level: next.level,
        missing:
          next.mode === "any"
            ? next.requirements.every((q) => !q.met)
              ? next.requirements
              : []
            : next.requirements.filter((q) => !q.met),
      }
    : null;
  const counts = `${s.evidence.total} evidence link${s.evidence.total === 1 ? "" : "s"} (${s.evidence.qualifying} moderate/strong, ${s.evidence.qualifyingVerified} verified), ${s.projects.total} project${s.projects.total === 1 ? "" : "s"} (${s.projects.production} in production), ${s.certifications.earned} earned certification${s.certifications.earned === 1 ? "" : "s"}`;
  if (level === 0) {
    const state: LevelState = hasLinkedRecords ? "insufficient_evidence" : "no_evidence";
    return {
      model: SKILL_LEVEL_MODEL_VERSION,
      state,
      level: null,
      rules,
      nextLevel,
      explanation:
        state === "no_evidence"
          ? "No evidence, project or certification is linked to this skill, so no level can be derived."
          : `Linked records exist (${counts}), but none qualifies for level 1.`,
    };
  }
  return {
    model: SKILL_LEVEL_MODEL_VERSION,
    state: "derived",
    level,
    rules,
    nextLevel,
    explanation: `Highest level whose evidence rules all hold: ${level}. Based on ${counts}.`,
  };
}

// ── freshness-v1 ────────────────────────────────────────────────────────────

export type FreshnessState = "fresh" | "aging" | "stale" | "no_dated_evidence" | "no_evidence";

export interface Freshness {
  model: typeof FRESHNESS_MODEL_VERSION;
  state: FreshnessState;
  latest: string | null;
  daysSince: number | null;
  explanation: string;
}

export function freshness(s: SkillSignals, now: Date): Freshness {
  const base = { model: FRESHNESS_MODEL_VERSION } as const;
  const d = s.demonstrations;
  if (!d.latest) {
    const linked = s.evidence.total > 0;
    return {
      ...base,
      state: linked ? "no_dated_evidence" : "no_evidence",
      latest: null,
      daysSince: null,
      explanation: linked
        ? `${s.evidence.total} linked evidence item${s.evidence.total === 1 ? "" : "s"} but no demonstration date on or before today${d.future ? ` (${d.future} dated in the future, ignored)` : ""}.`
        : "No evidence is linked, so there is no demonstration date.",
    };
  }
  const days = daysBetween(d.latest, utcDay(now));
  const state: FreshnessState =
    days <= FRESH_MAX_DAYS ? "fresh" : days <= AGING_MAX_DAYS ? "aging" : "stale";
  return {
    ...base,
    state,
    latest: toDateOnly(d.latest),
    daysSince: days,
    explanation: `Last demonstrated ${toDateOnly(d.latest)} (${days} day${days === 1 ? "" : "s"} ago): ${state} (fresh ≤ ${FRESH_MAX_DAYS} days, aging ≤ ${AGING_MAX_DAYS}, stale beyond).`,
  };
}

// ── skill-trend-v1 ──────────────────────────────────────────────────────────

export type TrendState = "increasing" | "stable" | "decreasing" | "insufficient_history";

export interface Trend {
  model: typeof TREND_MODEL_VERSION;
  state: TrendState;
  recentWindow: number;
  previousWindow: number;
  explanation: string;
}

/** Window boundaries for skill-trend-v1 (inclusive UTC days). */
export function trendWindows(now: Date) {
  const today = utcDay(now);
  const recentStart = addDays(today, -(TREND_WINDOW_DAYS - 1));
  const previousStart = addDays(recentStart, -TREND_WINDOW_DAYS);
  return { today, recentStart, previousStart, previousEnd: addDays(recentStart, -1) };
}

/**
 * Demonstration-activity trend: dated demonstrations in the last 12 months vs the 12 months
 * before. It describes activity, not proficiency, and never interpolates a level history.
 * Insufficient history: fewer than 2 dated demonstrations, none before the recent window, or none
 * at all in the last 24 months (sparse history is never interpolated).
 */
export function trend(s: SkillSignals, now: Date): Trend {
  const { recentStart } = trendWindows(now);
  const d = s.demonstrations;
  const base = {
    model: TREND_MODEL_VERSION,
    recentWindow: d.recentWindow,
    previousWindow: d.previousWindow,
  } as const;
  if (d.dated >= 2 && d.recentWindow + d.previousWindow === 0) {
    return {
      ...base,
      state: "insufficient_history",
      explanation:
        "Trend unavailable — no dated demonstrations in the last 24 months (sparse history is not interpolated).",
    };
  }
  if (d.dated < 2 || !d.earliest || d.earliest.getTime() >= recentStart.getTime()) {
    return {
      ...base,
      state: "insufficient_history",
      explanation:
        "Trend unavailable — it needs at least 2 dated demonstrations and at least one older than 12 months.",
    };
  }
  const state: TrendState =
    d.recentWindow > d.previousWindow
      ? "increasing"
      : d.recentWindow < d.previousWindow
        ? "decreasing"
        : "stable";
  return {
    ...base,
    state,
    explanation: `${d.recentWindow} dated demonstration${d.recentWindow === 1 ? "" : "s"} in the last 12 months vs ${d.previousWindow} in the 12 months before (activity, not proficiency).`,
  };
}

// ── gap-analysis-v1 ─────────────────────────────────────────────────────────

export type GapState =
  "below_target" | "at_target" | "above_target" | "not_computable" | "no_target";

export interface Gap {
  model: typeof GAP_MODEL_VERSION;
  state: GapState;
  /** target − derived level (positive = below target); null unless both exist. */
  gap: number | null;
  critical: boolean;
  /** Target set, but no level can be derived (listed separately — never "critical"). */
  targetWithoutEvidence: boolean;
  explanation: string;
}

/**
 * Critical gap (gap-analysis-v1): an active skill with a target ≥ 1 and a derived level that is
 * (a) at least 2 levels below target, or (b) below target with stale evidence.
 * Skills without evidence are never critical; they are reported as "target without evidence".
 */
export function gapAnalysis(input: {
  active: boolean;
  targetLevel: number | null;
  derived: DerivedLevel;
  freshness: Freshness;
}): Gap {
  const base = { model: GAP_MODEL_VERSION } as const;
  const target = input.targetLevel;
  if (target === null || target < 1) {
    return {
      ...base,
      state: "no_target",
      gap: null,
      critical: false,
      targetWithoutEvidence: false,
      explanation:
        target === 0
          ? "Target 0 means “not evaluated”, so there is no target to compare with."
          : "No target level is configured.",
    };
  }
  if (input.derived.level === null) {
    return {
      ...base,
      state: "not_computable",
      gap: null,
      critical: false,
      targetWithoutEvidence: true,
      explanation: `Target ${target}, but no level can be derived from the linked records — the gap is not computable.`,
    };
  }
  const gap = target - input.derived.level;
  const stale = input.freshness.state === "stale";
  const critical = input.active && (gap >= 2 || (gap >= 1 && stale));
  const state: GapState = gap > 0 ? "below_target" : gap === 0 ? "at_target" : "above_target";
  const reason = critical
    ? gap >= 2
      ? ` Critical: ${gap} levels below target.`
      : " Critical: below target and the latest demonstration is stale."
    : "";
  return {
    ...base,
    state,
    gap,
    critical,
    targetWithoutEvidence: false,
    explanation:
      state === "below_target"
        ? `Derived level ${input.derived.level} is ${gap} below target ${target}.${reason}`
        : state === "at_target"
          ? `Derived level ${input.derived.level} meets target ${target}.`
          : `Derived level ${input.derived.level} is ${-gap} above target ${target}.`,
  };
}

/** Everything about one skill, computed from its signals. */
export function analyseSkill(
  skill: { active: boolean; targetLevel: number | null },
  signals: SkillSignals,
  now: Date,
) {
  const derived = deriveLevel(signals);
  const fresh = freshness(signals, now);
  return {
    derived,
    freshness: fresh,
    trend: trend(signals, now),
    gap: gapAnalysis({
      active: skill.active,
      targetLevel: skill.targetLevel,
      derived,
      freshness: fresh,
    }),
    productionLinked: productionLinked(signals),
  };
}

export type SkillAnalysis = ReturnType<typeof analyseSkill>;
