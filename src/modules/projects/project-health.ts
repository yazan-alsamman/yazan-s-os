import type { ProjectStatus } from "@/generated/prisma/enums";
import { daysBetween, utcDay } from "@/modules/shared/calendar";
import { toDateOnly } from "@/modules/shared/fields";

import { ACTIVE_STATUSES } from "./project.lifecycle";

/**
 * Computed project health — model `project-health-v1` (ADR 0023 relationship to manual health,
 * ADR 0024 formula). A transparent analytical signal, never a replacement for the user's manual
 * `healthStatus`. Every component states its inputs, its rule and its result; components without
 * real data say so instead of guessing.
 *
 * Spec 01 §3: derived from schedule, blockers, scope stability, issue severity, recent activity
 * and milestone completion — "never show an unexplained single number".
 */
export const HEALTH_MODEL_VERSION = "project-health-v1";
export const ACTIVITY_WINDOW_DAYS = 30;
/** Minimum number of scored components for an overall score. */
export const MIN_SCORED_COMPONENTS = 2;

export const HEALTH_COMPONENTS = [
  "schedule",
  "milestones",
  "blockers",
  "recent_activity",
  "scope_stability",
  "issue_severity",
] as const;
export type HealthComponentKey = (typeof HEALTH_COMPONENTS)[number];

export const HEALTH_COMPONENT_LABELS: Record<HealthComponentKey, string> = {
  schedule: "Schedule",
  milestones: "Milestone completion",
  blockers: "Blockers",
  recent_activity: "Recent activity",
  scope_stability: "Scope stability",
  issue_severity: "Issue severity",
};

/**
 * - `scored`            — computed from real data; `score` is 0–100
 * - `insufficient_data` — the inputs exist in PEOS but this project lacks them (e.g. no target date)
 * - `not_applicable`    — the component does not apply to this project's stage
 * - `unavailable`       — PEOS has no data source for this component yet
 */
export type ComponentState = "scored" | "insufficient_data" | "not_applicable" | "unavailable";

export interface HealthComponent {
  key: HealthComponentKey;
  label: string;
  state: ComponentState;
  score: number | null;
  /** One sentence: what was found and why it scored this way (or why it could not). */
  explanation: string;
  /** The persisted fields this component reads. */
  inputs: string[];
}

export type HealthBand = "good" | "watch" | "poor";
export const HEALTH_BAND_LABELS: Record<HealthBand, string> = {
  good: "Good",
  watch: "Needs watching",
  poor: "Poor",
};

/**
 * Overall status:
 * - `complete`          — all six components scored (not reachable in v1: two have no source)
 * - `partial`           — at least MIN_SCORED_COMPONENTS scored; the score covers only those
 * - `insufficient_data` — fewer than MIN_SCORED_COMPONENTS scored → no overall score
 * - `not_applicable`    — archived projects are not assessed
 */
export type HealthStatus = "complete" | "partial" | "insufficient_data" | "not_applicable";

export interface ComputedHealth {
  model: typeof HEALTH_MODEL_VERSION;
  status: HealthStatus;
  score: number | null;
  band: HealthBand | null;
  explanation: string;
  scoredComponents: number;
  components: HealthComponent[];
  evaluatedOn: string;
}

export interface HealthInputs {
  status: ProjectStatus;
  targetDate: Date | null;
  completedAt: Date | null;
  milestones: {
    total: number;
    completed: number;
    /** Open milestones whose planned date is before today. */
    overdue: number;
    /** planned + in_progress + blocked. */
    open: number;
    blocked: number;
  };
  /** Audit events on the project or its milestones in the last ACTIVITY_WINDOW_DAYS days. */
  recentEvents: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function scheduleComponent(input: HealthInputs, today: Date): HealthComponent {
  const base = {
    key: "schedule" as const,
    label: HEALTH_COMPONENT_LABELS.schedule,
    inputs: ["Project.targetDate", "Project.completedAt"],
  };
  const target = input.targetDate;
  if (input.completedAt) {
    if (!target) {
      return {
        ...base,
        state: "insufficient_data",
        score: null,
        explanation: `Completed on ${toDateOnly(input.completedAt)}, but there is no target date to compare with.`,
      };
    }
    const late = daysBetween(target, input.completedAt);
    return late <= 0
      ? {
          ...base,
          state: "scored",
          score: 100,
          explanation: `Completed on ${toDateOnly(input.completedAt)}, on or before the target date ${toDateOnly(target)}.`,
        }
      : {
          ...base,
          state: "scored",
          score: 50,
          explanation: `Completed ${plural(late, "day")} after the target date ${toDateOnly(target)}.`,
        };
  }
  if (!target) {
    return {
      ...base,
      state: "insufficient_data",
      score: null,
      explanation: "No target date is set, so the schedule cannot be assessed.",
    };
  }
  const remaining = daysBetween(utcDay(today), target);
  return remaining < 0
    ? {
        ...base,
        state: "scored",
        score: 0,
        explanation: `The target date ${toDateOnly(target)} passed ${plural(-remaining, "day")} ago without a completion date.`,
      }
    : {
        ...base,
        state: "scored",
        score: 100,
        explanation:
          remaining === 0
            ? `The target date ${toDateOnly(target)} is today.`
            : `The target date ${toDateOnly(target)} is ${plural(remaining, "day")} away.`,
      };
}

/** Delivery rate (spec 05) = completed / (completed + overdue); null when the denominator is 0. */
export function deliveryRate(m: { completed: number; overdue: number }): number | null {
  const denominator = m.completed + m.overdue;
  return denominator === 0 ? null : m.completed / denominator;
}

export function milestoneComponent(input: HealthInputs): HealthComponent {
  const base = {
    key: "milestones" as const,
    label: HEALTH_COMPONENT_LABELS.milestones,
    inputs: ["Milestone.status", "Milestone.dueDate", "Milestone.completedAt"],
  };
  const m = input.milestones;
  const rate = deliveryRate(m);
  if (rate === null) {
    return {
      ...base,
      state: "insufficient_data",
      score: null,
      explanation:
        m.total === 0
          ? "No milestones are recorded."
          : "No milestone is completed or past its planned date yet.",
    };
  }
  return {
    ...base,
    state: "scored",
    score: Math.round(rate * 100),
    explanation: `${m.completed} of ${m.completed + m.overdue} milestones that are done or past their planned date are complete (${plural(m.overdue, "overdue milestone")}).`,
  };
}

export function blockerComponent(input: HealthInputs): HealthComponent {
  const base = {
    key: "blockers" as const,
    label: HEALTH_COMPONENT_LABELS.blockers,
    inputs: ["Milestone.status = blocked"],
  };
  const { open, blocked } = input.milestones;
  if (open === 0) {
    return {
      ...base,
      state: "insufficient_data",
      score: null,
      explanation: "There are no open milestones to check for blockers.",
    };
  }
  return blocked > 0
    ? {
        ...base,
        state: "scored",
        score: 0,
        explanation: `${blocked} of ${plural(open, "open milestone")} ${blocked === 1 ? "is" : "are"} blocked.`,
      }
    : {
        ...base,
        state: "scored",
        score: 100,
        explanation: `None of ${plural(open, "open milestone")} is blocked.`,
      };
}

export function activityComponent(input: HealthInputs): HealthComponent {
  const base = {
    key: "recent_activity" as const,
    label: HEALTH_COMPONENT_LABELS.recent_activity,
    inputs: ["AuditLog (project and its milestones)"],
  };
  if (!(ACTIVE_STATUSES as readonly string[]).includes(input.status)) {
    return {
      ...base,
      state: "not_applicable",
      score: null,
      explanation: "Recent activity is assessed only for projects in an active lifecycle stage.",
    };
  }
  return input.recentEvents > 0
    ? {
        ...base,
        state: "scored",
        score: 100,
        explanation: `${plural(input.recentEvents, "recorded change")} to the project or its milestones in the last ${ACTIVITY_WINDOW_DAYS} days.`,
      }
    : {
        ...base,
        state: "scored",
        score: 0,
        explanation: `No recorded change to the project or its milestones in the last ${ACTIVITY_WINDOW_DAYS} days.`,
      };
}

const UNAVAILABLE_COMPONENTS: HealthComponent[] = [
  {
    key: "scope_stability",
    label: HEALTH_COMPONENT_LABELS.scope_stability,
    state: "unavailable",
    score: null,
    explanation:
      "PEOS does not record a committed-scope baseline or scope changes, so scope stability cannot be measured.",
    inputs: [],
  },
  {
    key: "issue_severity",
    label: HEALTH_COMPONENT_LABELS.issue_severity,
    state: "unavailable",
    score: null,
    explanation:
      "PEOS has no issue tracking; issue severity needs the engineering integrations (Phase 9).",
    inputs: [],
  },
];

export function bandOf(score: number): HealthBand {
  if (score >= 75) return "good";
  if (score >= 50) return "watch";
  return "poor";
}

/** The full v1 model: equal-weight mean of the scored components. */
export function computeProjectHealth(input: HealthInputs, now: Date): ComputedHealth {
  const today = utcDay(now);
  const evaluatedOn = toDateOnly(today)!;
  if (input.status === "archived") {
    return {
      model: HEALTH_MODEL_VERSION,
      status: "not_applicable",
      score: null,
      band: null,
      explanation: "Archived projects are not assessed.",
      scoredComponents: 0,
      components: [],
      evaluatedOn,
    };
  }
  const components = [
    scheduleComponent(input, today),
    milestoneComponent(input),
    blockerComponent(input),
    activityComponent(input),
    ...UNAVAILABLE_COMPONENTS,
  ];
  const scored = components.filter((c) => c.state === "scored");
  if (scored.length < MIN_SCORED_COMPONENTS) {
    return {
      model: HEALTH_MODEL_VERSION,
      status: "insufficient_data",
      score: null,
      band: null,
      explanation: `Only ${scored.length} of ${components.length} components could be scored; at least ${MIN_SCORED_COMPONENTS} are needed for an overall score.`,
      scoredComponents: scored.length,
      components,
      evaluatedOn,
    };
  }
  const score = Math.round(scored.reduce((sum, c) => sum + c.score!, 0) / scored.length);
  const status: HealthStatus = scored.length === components.length ? "complete" : "partial";
  return {
    model: HEALTH_MODEL_VERSION,
    status,
    score,
    band: bandOf(score),
    explanation: `Average of ${scored.length} scored components (${scored
      .map((c) => `${c.label} ${c.score}`)
      .join(
        ", ",
      )}), each weighted equally. ${components.length - scored.length} components were not scored.`,
    scoredComponents: scored.length,
    components,
    evaluatedOn,
  };
}
