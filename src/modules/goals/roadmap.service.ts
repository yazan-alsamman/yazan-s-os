import type { PrismaClient } from "@/generated/prisma/client";
import { addDays, utcDay } from "@/modules/shared/calendar";
import { toDateOnly } from "@/modules/shared/fields";
import type { ServiceContext } from "@/modules/shared/service-context";

import {
  analyseGoals,
  quarterBounds,
  quarterOf,
  quartersBetween,
  toGoalRow,
} from "./goal-intelligence";
import { isOpenGoal } from "./goal.rules";

/**
 * Roadmap (Phase 5, ADR 0035). Built from persisted goal dates and relationships only.
 * - Dates are UTC calendar days; quarters are UTC calendar quarters.
 * - Window: default = previous quarter through the next six; at most 5 years (validated).
 * - Timeline bars exist only where a goal has a deadline (start optional) — nothing is fabricated.
 * - Undated open goals are listed separately; the hierarchy tree and dependency edges are bounded
 *   by MAX_GOALS_PER_USER.
 */
export const ROADMAP_ITEM_LIMIT = 500;

export function createRoadmapService(db: PrismaClient, clock: () => Date = () => new Date()) {
  return {
    async roadmap(ctx: ServiceContext, window: { from?: Date; to?: Date }) {
      const now = clock();
      const today = utcDay(now);
      const currentQuarter = quarterBounds(quarterOf(today));
      const from = window.from ?? quarterBounds(quarterOf(addDays(currentQuarter.from, -1))).from;
      const to = window.to ?? quarterBounds(quarterOf(addDays(currentQuarter.from, 6 * 92))).to;
      const quarters = quartersBetween(from, to);

      const [analysed, edges] = await Promise.all([
        analyseGoals(db, ctx.userId, now),
        db.goalDependency.findMany({
          where: { userId: ctx.userId },
          select: { goalId: true, dependsOnGoalId: true },
          orderBy: [{ goalId: "asc" }, { dependsOnGoalId: "asc" }],
        }),
      ]);
      const inWindow = (d: Date | null) => d !== null && d >= from && d <= to;
      const timeline = analysed
        .filter(
          (a) =>
            inWindow(a.goal.deadline) ||
            inWindow(a.goal.startDate) ||
            (a.overdue && a.goal.deadline !== null),
        )
        .slice(0, ROADMAP_ITEM_LIMIT);
      const undated = analysed.filter((a) => a.goal.deadline === null && isOpenGoal(a.goal.status));

      return {
        calculatedAt: now.toISOString(),
        evaluatedOn: toDateOnly(today)!,
        window: { from: toDateOnly(from)!, to: toDateOnly(to)! },
        quarters: quarters.map((q) => ({
          key: q,
          from: toDateOnly(quarterBounds(q).from)!,
          to: toDateOnly(quarterBounds(q).to)!,
        })),
        timeline: timeline.map((a) => ({
          ...toGoalRow(a),
          quarter: a.goal.deadline ? quarterOf(a.goal.deadline) : null,
        })),
        truncated: timeline.length >= ROADMAP_ITEM_LIMIT,
        undated: { count: undated.length, items: undated.slice(0, 50).map(toGoalRow) },
        tree: analysed.map((a) => ({
          id: a.goal.id,
          parentId: a.goal.parentId,
          title: a.goal.title,
          type: a.goal.type,
          status: a.goal.status,
          deadline: toDateOnly(a.goal.deadline),
          risk: a.risk.state,
        })),
        dependencies: edges,
      };
    },
  };
}

export type RoadmapDto = Awaited<ReturnType<ReturnType<typeof createRoadmapService>["roadmap"]>>;
