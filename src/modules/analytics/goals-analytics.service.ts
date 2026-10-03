import type { PrismaClient } from "@/generated/prisma/client";
import {
  analyseGoals,
  matchesDerived,
  quarterBounds,
  quarterOf,
  quartersBetween,
  type AnalysedGoal,
} from "@/modules/goals/goal-intelligence";
import { GOAL_STATUSES, isOpenGoal } from "@/modules/goals/goal.rules";
import type { ListGoalsQuery } from "@/modules/goals/goal.schemas";
import { addDays, utcDay } from "@/modules/shared/calendar";
import { toDateOnly } from "@/modules/shared/fields";
import type { ServiceContext } from "@/modules/shared/service-context";

import { metricResult } from "./metric-result";

/**
 * Goal analytics (Phase 5, ADR 0034). All metrics are computed from one analysed goal set with the
 * same filter semantics as GET /api/v1/goals (structural fields mirrored here, derived fields via
 * `matchesDerived`), so every count equals its drill-down list total (integration-tested).
 */
type Query = Partial<ListGoalsQuery>;

const dateOnly = (d: Date | null) => (d ? d.getTime() : null);

/** In-memory mirror of `goalWhere` for the structural filters metrics use. */
export function matchesGoalQuery(a: AnalysedGoal, q: Query): boolean {
  const g = a.goal;
  if (q.status && g.status !== q.status) return false;
  if (q.open !== undefined && isOpenGoal(g.status) !== q.open) return false;
  if (
    q.committed !== undefined &&
    (isOpenGoal(g.status) || g.status === "completed") !== q.committed
  )
    return false;
  if (q.hasDeadline !== undefined && (g.deadline !== null) !== q.hasDeadline) return false;
  if (q.hasProjects !== undefined && a.signals.projects.total > 0 !== q.hasProjects) return false;
  if (q.hasSkills !== undefined && a.signals.skills.total > 0 !== q.hasSkills) return false;
  if (q.deadlineFrom || q.deadlineTo) {
    const t = dateOnly(g.deadline);
    if (t === null) return false;
    if (q.deadlineFrom && t < q.deadlineFrom.getTime()) return false;
    if (q.deadlineTo && t > q.deadlineTo.getTime()) return false;
  }
  return matchesDerived(a, q);
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function createGoalsAnalyticsService(
  db: PrismaClient,
  clock: () => Date = () => new Date(),
) {
  return {
    async summary(ctx: ServiceContext) {
      const now = clock();
      const today = utcDay(now);
      const all = await analyseGoals(db, ctx.userId, now);
      const count = (q: Query) => all.filter((a) => matchesGoalQuery(a, q)).length;
      const has = all.length > 0;
      const noGoals = "No goals yet.";
      const open = count({ open: true });
      const noOpen = "No active or on-hold goals.";
      const m = (key: string, value: number, base = has, reason = noGoals) =>
        metricResult(key, { value, hasBaseRecords: base, noDataReason: reason });

      const completed = count({ status: "completed" });
      const overdue = count({ overdue: true });
      const attained = count({ committed: true, attainment: "attained" });
      const measurable =
        count({ committed: true }) - count({ committed: true, attainment: "not_computable" });

      // Deadline load: overdue, current + next 3 quarters, later, no deadline (open goals).
      const quarters = quartersBetween(today, addDays(today, 3 * 92)).slice(0, 4);
      const lastQuarterEnd = quarterBounds(quarters.at(-1)!).to;
      const load = [
        { key: "overdue", label: "Overdue", value: count({ open: true, overdue: true }) },
        // Quarter buckets exclude overdue goals, so buckets never overlap (and need no clock to drill).
        ...quarters.map((q) => {
          const { from, to } = quarterBounds(q);
          return {
            key: q,
            label: q,
            value: count({ open: true, deadlineFrom: from, deadlineTo: to, overdue: false }),
          };
        }),
        {
          key: `after:${toDateOnly(addDays(lastQuarterEnd, 1))}`,
          label: "Later",
          value: count({ open: true, deadlineFrom: addDays(lastQuarterEnd, 1), overdue: false }),
        },
        { key: "none", label: "No deadline", value: count({ open: true, hasDeadline: false }) },
      ];

      return {
        calculatedAt: now.toISOString(),
        evaluatedOn: toDateOnly(today)!,
        recordCounts: { goals: all.length, open },
        total: m("goals.total", all.length),
        active: m("goals.active", count({ status: "active" })),
        overdue: m("goals.overdue", overdue),
        completionRate: metricResult("goals.completion_rate", {
          value: completed + overdue ? completed / (completed + overdue) : 0,
          hasBaseRecords: has,
          noDataReason: noGoals,
          insufficientReason: completed + overdue ? null : "No goal is completed or overdue yet.",
          breakdown: [
            { key: "completed", label: "Completed", value: completed },
            { key: "overdue", label: "Overdue", value: overdue },
          ],
        }),
        atRisk: m("goals.at_risk", count({ risk: "at_risk" })),
        onTrack: m("goals.on_track", count({ risk: "on_track" })),
        risk: metricResult("goals.risk_distribution", {
          value: open,
          hasBaseRecords: has,
          noDataReason: noGoals,
          insufficientReason: open ? null : noOpen,
          breakdown: (
            [
              ["at_risk", "At risk"],
              ["on_track", "On track"],
              ["not_assessable", "Not assessable"],
            ] as const
          ).map(([key, label]) => ({ key, label, value: count({ risk: key }) })),
        }),
        status: metricResult("goals.status_distribution", {
          value: all.length,
          hasBaseRecords: has,
          noDataReason: noGoals,
          breakdown: GOAL_STATUSES.map((s) => ({
            key: s,
            label: STATUS_LABEL[s]!,
            value: count({ status: s }),
          })),
        }),
        attainment: metricResult("goals.target_attainment", {
          value: measurable ? attained / measurable : 0,
          hasBaseRecords: has,
          noDataReason: noGoals,
          insufficientReason: measurable
            ? null
            : "No open or completed goal has a baseline, target and measurement.",
          breakdown: [
            { key: "attained", label: "Attained", value: attained },
            { key: "other", label: "Not yet attained", value: measurable - attained },
          ],
        }),
        attainmentStates: metricResult("goals.attainment_distribution", {
          value: all.filter((a) => isOpenGoal(a.goal.status) || a.goal.status === "completed")
            .length,
          hasBaseRecords: has,
          noDataReason: noGoals,
          breakdown: (
            [
              ["attained", "Attained"],
              ["in_progress", "In progress"],
              ["regressed", "Regressed"],
              ["not_computable", "Not computable"],
            ] as const
          ).map(([key, label]) => ({
            key,
            label,
            value: count({ committed: true, attainment: key }),
          })),
        }),
        withoutDeadline: m("goals.without_deadline", count({ open: true, hasDeadline: false })),
        withoutProjects: m("goals.without_projects", count({ open: true, hasProjects: false })),
        withoutSkills: m("goals.without_skills", count({ open: true, hasSkills: false })),
        withSkillGaps: m("goals.with_skill_gaps", count({ open: true, skillGap: true })),
        load: metricResult("goals.deadline_load", {
          value: open,
          hasBaseRecords: has,
          noDataReason: noGoals,
          insufficientReason: open ? null : noOpen,
          breakdown: load,
        }),
        attention: all
          .filter((a) => a.risk.state === "at_risk")
          .sort(
            (x, y) =>
              y.risk.signals.length - x.risk.signals.length ||
              x.goal.title.localeCompare(y.goal.title),
          )
          .slice(0, 10)
          .map((a) => ({
            id: a.goal.id,
            title: a.goal.title,
            signals: a.risk.signals.map((s) => s.label),
            deadline: toDateOnly(a.goal.deadline),
          })),
        quarters: quarters.map((q) => ({
          key: q,
          from: toDateOnly(quarterBounds(q).from)!,
          to: toDateOnly(quarterBounds(q).to)!,
        })),
      };
    },
  };
}

export type GoalsAnalyticsDto = Awaited<
  ReturnType<ReturnType<typeof createGoalsAnalyticsService>["summary"]>
>;
export { quarterOf };
