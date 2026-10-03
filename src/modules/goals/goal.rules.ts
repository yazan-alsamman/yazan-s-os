import type { GoalStatus, GoalType } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors/app-error";
import { utcDay } from "@/modules/shared/calendar";
import { toDateOnly } from "@/modules/shared/fields";

/**
 * Goal rules (Phase 5). Pure, deterministic and unit-tested; `today` is always the UTC calendar day.
 *
 *   goal-lifecycle-v1   ADR 0031   explicit transition table; completed ⇔ completedAt
 *   goal hierarchy      ADR 0031   01 §8 levels, strict rank → acyclic, depth ≤ 3
 *   goal-attainment-v1  ADR 0033   (latest − baseline) / (target − baseline)
 *   goal-risk-v1        ADR 0033   explicit signals, no score
 */
export const GOAL_TYPES = [
  "north_star",
  "annual_objective",
  "quarterly_goal",
] as const satisfies readonly GoalType[];
export const GOAL_STATUSES = [
  "draft",
  "active",
  "on_hold",
  "completed",
  "cancelled",
] as const satisfies readonly GoalStatus[];
/** Committed, unfinished goals. Drafts are not commitments yet; closed goals are done or dropped. */
export const OPEN_GOAL_STATUSES = ["active", "on_hold"] as const satisfies readonly GoalStatus[];
export const MAX_GOALS_PER_USER = 2_000;
export const MAX_HIERARCHY_DEPTH = GOAL_TYPES.length;

export const GOAL_TYPE_LABEL: Record<GoalType, string> = {
  north_star: "North Star",
  annual_objective: "Annual objective",
  quarterly_goal: "Quarterly goal",
};

export const isOpenGoal = (status: GoalStatus) =>
  (OPEN_GOAL_STATUSES as readonly string[]).includes(status);

// ── Hierarchy ───────────────────────────────────────────────────────────────

const RANK: Record<GoalType, number> = { north_star: 0, annual_objective: 1, quarterly_goal: 2 };

/**
 * 01 §8: North Star → Annual Objective → Quarterly Goal. A parent must be of a strictly higher
 * level than its child (levels may be skipped). Because rank strictly increases along every path,
 * the hierarchy is acyclic and at most 3 levels deep by construction.
 */
export function canBeParent(parentType: GoalType, childType: GoalType): boolean {
  return RANK[parentType] < RANK[childType];
}

export function assertValidParent(
  child: { id?: string; type: GoalType },
  parent: { id: string; type: GoalType } | null,
  childrenTypes: readonly GoalType[] = [],
) {
  if (!parent) return;
  if (child.id && parent.id === child.id) {
    throw new AppError("VALIDATION_FAILED", {
      details: [{ path: "parentId", message: "A goal cannot be its own parent" }],
    });
  }
  if (!canBeParent(parent.type, child.type)) {
    throw new AppError("VALIDATION_FAILED", {
      details: [
        {
          path: "parentId",
          message: `A ${GOAL_TYPE_LABEL[child.type]} can only sit under a higher level (${GOAL_TYPE_LABEL[parent.type]} is not higher)`,
        },
      ],
    });
  }
  // Changing a goal's own type must keep its existing children below it.
  for (const t of childrenTypes) {
    if (!canBeParent(child.type, t)) {
      throw new AppError("VALIDATION_FAILED", {
        details: [{ path: "type", message: "The goal's children must stay at a lower level" }],
      });
    }
  }
}

export function assertChildrenFit(type: GoalType, childrenTypes: readonly GoalType[]) {
  if (childrenTypes.some((t) => !canBeParent(type, t))) {
    throw new AppError("VALIDATION_FAILED", {
      details: [{ path: "type", message: "The goal's children must stay at a lower level" }],
    });
  }
}

/**
 * Would adding edge `from → to` (from depends on to) create a cycle? Bounded breadth-first search
 * over the owner's dependency edges: visits each goal at most once.
 */
export function createsDependencyCycle(
  edges: readonly { goalId: string; dependsOnGoalId: string }[],
  from: string,
  to: string,
): boolean {
  if (from === to) return true;
  const next = new Map<string, string[]>();
  for (const e of edges) next.set(e.goalId, [...(next.get(e.goalId) ?? []), e.dependsOnGoalId]);
  const seen = new Set<string>([to]);
  const queue = [to];
  while (queue.length) {
    const current = queue.shift()!;
    if (current === from) return true;
    for (const n of next.get(current) ?? []) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return false;
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

/** goal-lifecycle-v1 transition table (ADR 0031). Same-status updates are always allowed. */
export const GOAL_TRANSITIONS: Record<GoalStatus, readonly GoalStatus[]> = {
  draft: ["active", "cancelled"],
  active: ["on_hold", "completed", "cancelled"],
  on_hold: ["active", "completed", "cancelled"],
  completed: ["active"], // reopen
  cancelled: ["draft", "active"], // restore
};

export function assertTransition(from: GoalStatus, to: GoalStatus) {
  if (from === to || GOAL_TRANSITIONS[from].includes(to)) return;
  throw new AppError("VALIDATION_FAILED", {
    details: [
      {
        path: "status",
        message: `A goal cannot move from ${from.replace("_", " ")} to ${to.replace("_", " ")}`,
      },
    ],
  });
}

/** completed ⇔ completion date; completing defaults to today; future dates and stray dates rejected. */
export function resolveGoalCompletion(
  input: { status: GoalStatus; completedAt: Date | null | undefined },
  now: Date,
): { status: GoalStatus; completedAt: Date | null } {
  const today = utcDay(now);
  if (input.status === "completed") {
    const completedAt = input.completedAt ?? today;
    if (completedAt.getTime() > today.getTime()) {
      throw new AppError("VALIDATION_FAILED", {
        details: [{ path: "completedAt", message: "A completion date cannot be in the future" }],
      });
    }
    return { status: "completed", completedAt };
  }
  if (input.completedAt) {
    throw new AppError("VALIDATION_FAILED", {
      details: [
        {
          path: "completedAt",
          message: "Only completed goals have a completion date — set the status to completed",
        },
      ],
    });
  }
  return { status: input.status, completedAt: null };
}

export function goalTransitionVerb(
  before: GoalStatus,
  after: GoalStatus,
): "completed" | "reopened" | "updated" {
  if (before !== "completed" && after === "completed") return "completed";
  if (before === "completed" && after !== "completed") return "reopened";
  return "updated";
}

/** Overdue: an open goal (active / on hold) whose deadline is strictly before today (UTC). */
export function isGoalOverdue(
  goal: { status: GoalStatus; deadline: Date | null },
  now: Date,
): boolean {
  return (
    isOpenGoal(goal.status) &&
    goal.deadline !== null &&
    goal.deadline.getTime() < utcDay(now).getTime()
  );
}

// ── Target attainment (goal-attainment-v1) ──────────────────────────────────

export type AttainmentState = "attained" | "in_progress" | "regressed" | "not_computable";

export interface Attainment {
  model: "goal-attainment-v1";
  state: AttainmentState;
  /** (latest − baseline) / (target − baseline); 1 = target reached. null unless computable. */
  progress: number | null;
  latest: { date: string; value: number } | null;
  explanation: string;
}

/**
 * Progress toward the measurable target. Direction comes from the sign of (target − baseline), so
 * "lower is better" metrics work. Missing inputs → not computable (never 0 % or 100 %).
 */
export function attainment(
  goal: { baseline: number | null; target: number | null; unit?: string | null },
  latest: { date: Date; value: number } | null,
): Attainment {
  const base = { model: "goal-attainment-v1" as const };
  const fmt = (v: number) => `${Number(v.toFixed(4))}${goal.unit ? ` ${goal.unit}` : ""}`;
  const latestDto = latest ? { date: toDateOnly(latest.date)!, value: latest.value } : null;
  if (goal.baseline === null || goal.target === null) {
    return {
      ...base,
      state: "not_computable",
      progress: null,
      latest: latestDto,
      explanation: "No baseline and target are set, so attainment is not computable.",
    };
  }
  if (goal.target === goal.baseline) {
    return {
      ...base,
      state: "not_computable",
      progress: null,
      latest: latestDto,
      explanation: "The target equals the baseline, so progress is undefined.",
    };
  }
  if (!latest) {
    return {
      ...base,
      state: "not_computable",
      progress: null,
      latest: null,
      explanation: "No measurement is recorded yet.",
    };
  }
  const progress = (latest.value - goal.baseline) / (goal.target - goal.baseline);
  const state: AttainmentState =
    progress >= 1 ? "attained" : progress < 0 ? "regressed" : "in_progress";
  return {
    ...base,
    state,
    progress,
    latest: latestDto,
    explanation: `Latest ${fmt(latest.value)} on ${toDateOnly(latest.date)}: ${Math.round(progress * 100)}% of the way from ${fmt(goal.baseline)} to ${fmt(goal.target)}.`,
  };
}

// ── Risk (goal-risk-v1) ─────────────────────────────────────────────────────

export type RiskState = "at_risk" | "on_track" | "not_assessable" | "not_applicable";

export interface RiskInputs {
  status: GoalStatus;
  deadline: Date | null;
  milestones: { total: number; overdue: number; blocked: number };
  projects: { total: number; atRiskOrBlocked: number };
  skills: { total: number; critical: number };
  dependencies: { total: number; blocking: number };
  attainment: AttainmentState;
  hasMeasurements: boolean;
}

export interface RiskSignal {
  key: string;
  label: string;
  count?: number;
}

export interface Risk {
  model: "goal-risk-v1";
  state: RiskState;
  signals: RiskSignal[];
  explanation: string;
}

/**
 * goal-risk-v1: an open goal is at risk when at least one real signal is present. Signals are
 * listed, never weighted or scored. Without any assessable input the goal is "not assessable".
 */
export function goalRisk(input: RiskInputs, now: Date): Risk {
  const base = { model: "goal-risk-v1" as const };
  if (!isOpenGoal(input.status)) {
    return {
      ...base,
      state: "not_applicable",
      signals: [],
      explanation: `Risk is assessed for active and on-hold goals only (this goal is ${input.status.replace("_", " ")}).`,
    };
  }
  const signals: RiskSignal[] = [];
  if (isGoalOverdue(input, now))
    signals.push({ key: "overdue", label: `Deadline ${toDateOnly(input.deadline)} has passed` });
  if (input.milestones.overdue)
    signals.push({
      key: "overdue_milestones",
      label: "Overdue linked milestones",
      count: input.milestones.overdue,
    });
  if (input.milestones.blocked)
    signals.push({
      key: "blocked_milestones",
      label: "Blocked linked milestones",
      count: input.milestones.blocked,
    });
  if (input.projects.atRiskOrBlocked)
    signals.push({
      key: "project_health",
      label: "Contributing projects marked at risk or blocked (manual health)",
      count: input.projects.atRiskOrBlocked,
    });
  if (input.skills.critical)
    signals.push({
      key: "skill_gaps",
      label: "Linked skills with a critical gap (skill intelligence)",
      count: input.skills.critical,
    });
  if (input.dependencies.blocking)
    signals.push({
      key: "dependencies",
      label: "Dependencies that are cancelled or overdue",
      count: input.dependencies.blocking,
    });
  if (input.attainment === "regressed")
    signals.push({ key: "regressed", label: "Latest measurement is worse than the baseline" });

  const assessable =
    input.deadline !== null ||
    input.milestones.total + input.projects.total + input.skills.total + input.dependencies.total >
      0 ||
    input.hasMeasurements;
  if (signals.length) {
    return {
      ...base,
      state: "at_risk",
      signals,
      explanation: `${signals.length} risk signal${signals.length === 1 ? "" : "s"}: ${signals.map((s) => (s.count ? `${s.label} (${s.count})` : s.label)).join("; ")}.`,
    };
  }
  if (!assessable) {
    return {
      ...base,
      state: "not_assessable",
      signals,
      explanation:
        "No deadline, links or measurements to assess — add a deadline, milestones, projects or skills.",
    };
  }
  return {
    ...base,
    state: "on_track",
    signals,
    explanation: "No risk signal is present in the linked records.",
  };
}
