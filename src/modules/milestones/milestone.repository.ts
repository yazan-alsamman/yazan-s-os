import type { Milestone, Prisma, PrismaClient } from "@/generated/prisma/client";
import { escapeLike } from "@/lib/db/errors";
import { toSkipTake } from "@/lib/http/pagination";
import type { Tx } from "@/modules/shared/audit";
import { utcDay } from "@/modules/shared/calendar";
import { toDateOnly } from "@/modules/shared/fields";

import { isOverdue, OPEN_MILESTONE_STATUSES } from "./milestone.rules";
import type { ListMilestonesQuery } from "./milestone.schemas";

type Db = PrismaClient | Tx;

/** Prisma filter for "overdue as of `today`" — the same rule as `isOverdue` (ADR 0022). */
export function overdueWhere(today: Date): Prisma.MilestoneWhereInput {
  return {
    status: { in: [...OPEN_MILESTONE_STATUSES] },
    dueDate: { lt: utcDay(today) },
    project: { status: { not: "archived" } },
  };
}

/** Owner-scoped list filter. Shared by the list endpoint and the analytics drill-down tests. */
export function milestoneListWhere(
  userId: string,
  query: Omit<ListMilestonesQuery, "page" | "pageSize" | "sort">,
  today: Date,
): Prisma.MilestoneWhereInput {
  const and: Prisma.MilestoneWhereInput[] = [{ userId }];
  if (query.projectId) and.push({ projectId: query.projectId });
  if (query.q) and.push({ title: { contains: escapeLike(query.q), mode: "insensitive" } });
  if (query.status) and.push({ status: query.status });
  if (query.open !== undefined) {
    and.push({
      status: query.open
        ? { in: [...OPEN_MILESTONE_STATUSES] }
        : { in: ["completed", "cancelled"] },
    });
  }
  if (query.overdue === true) and.push(overdueWhere(today));
  if (query.overdue === false) and.push({ NOT: overdueWhere(today) });
  if (query.dated !== undefined) and.push({ dueDate: query.dated ? { not: null } : null });
  if (query.dueFrom || query.dueTo) and.push({ dueDate: { gte: query.dueFrom, lte: query.dueTo } });
  if (query.completedFrom || query.completedTo) {
    and.push({ completedAt: { gte: query.completedFrom, lte: query.completedTo } });
  }
  return { AND: and };
}

export const milestoneInclude = {
  project: { select: { id: true, name: true, status: true } },
} satisfies Prisma.MilestoneInclude;

export type MilestoneRecord = Milestone & { project: { id: string; name: string; status: string } };

export function toMilestoneDto(milestone: MilestoneRecord, today: Date) {
  return {
    id: milestone.id,
    projectId: milestone.projectId,
    project: { id: milestone.project.id, name: milestone.project.name },
    title: milestone.title,
    status: milestone.status,
    dueDate: toDateOnly(milestone.dueDate),
    completedAt: toDateOnly(milestone.completedAt),
    overdue: isOverdue(milestone, today, milestone.project.status),
    createdAt: milestone.createdAt.toISOString(),
    updatedAt: milestone.updatedAt.toISOString(),
  };
}

export type MilestoneDto = ReturnType<typeof toMilestoneDto>;

/** Audit snapshot: domain fields only (no owner id). */
export function milestoneSnapshot(milestone: Milestone) {
  return {
    id: milestone.id,
    projectId: milestone.projectId,
    title: milestone.title,
    status: milestone.status,
    dueDate: toDateOnly(milestone.dueDate),
    completedAt: toDateOnly(milestone.completedAt),
  };
}

export const milestoneRepository = {
  findOwned(db: Db, userId: string, id: string) {
    return db.milestone.findFirst({ where: { id, userId }, include: milestoneInclude });
  },

  async list(db: Db, userId: string, query: ListMilestonesQuery, today: Date) {
    const where = milestoneListWhere(userId, query, today);
    const [rows, total] = await Promise.all([
      db.milestone.findMany({
        where,
        orderBy: query.sort as Prisma.MilestoneOrderByWithRelationInput[],
        ...toSkipTake(query),
        include: milestoneInclude,
      }),
      db.milestone.count({ where }),
    ]);
    return { rows, total };
  },
};
