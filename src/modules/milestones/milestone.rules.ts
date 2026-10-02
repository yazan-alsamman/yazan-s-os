import type { MilestoneStatus } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors/app-error";
import { utcDay } from "@/modules/shared/calendar";

/**
 * Milestone lifecycle rules (ADR 0022). Pure functions, so every transition and date boundary is
 * unit-tested without a database.
 *
 *   planned ⇄ in_progress ⇄ blocked ──→ completed ──(reopen)──→ planned | in_progress | blocked
 *        └──────────────┴──────────┴──→ cancelled ──(restore)──→ planned | in_progress | blocked
 *
 * Every transition is allowed. A milestone is **completed iff it has a completion date**; the
 * database enforces the same invariant (milestones_completion_chk).
 */
export const MILESTONE_STATUSES = [
  "planned",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
] as const satisfies readonly MilestoneStatus[];

/** Statuses that still represent committed, unfinished work. */
export const OPEN_MILESTONE_STATUSES = [
  "planned",
  "in_progress",
  "blocked",
] as const satisfies readonly MilestoneStatus[];

/** Hard cap per project: keeps every project query bounded (resource exhaustion). */
export const MAX_MILESTONES_PER_PROJECT = 500;

export function isOpen(status: MilestoneStatus): boolean {
  return (OPEN_MILESTONE_STATUSES as readonly string[]).includes(status);
}

/**
 * Overdue: an **open** milestone of a **non-archived** project whose planned date is strictly before
 * today (UTC calendar day). A milestone due today is not overdue. Undated, completed and cancelled
 * milestones, and milestones of archived projects, are never overdue.
 */
export function isOverdue(
  milestone: { status: MilestoneStatus; dueDate: Date | null },
  today: Date,
  projectStatus?: string,
): boolean {
  return (
    projectStatus !== "archived" &&
    isOpen(milestone.status) &&
    milestone.dueDate !== null &&
    milestone.dueDate.getTime() < utcDay(today).getTime()
  );
}

/**
 * Resolve the stored status/completion date for a create or update and reject inconsistent input.
 * - status `completed` without a date → completed today (UTC);
 * - a completion date in the future → rejected;
 * - a completion date with any other status → rejected (completion must be explicit);
 * - leaving `completed` (reopen) clears the completion date.
 */
export function resolveCompletion(
  input: { status: MilestoneStatus; completedAt: Date | null | undefined },
  today: Date,
): { status: MilestoneStatus; completedAt: Date | null } {
  const day = utcDay(today);
  if (input.status === "completed") {
    const completedAt = input.completedAt ?? day;
    if (completedAt.getTime() > day.getTime()) {
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
          message: "Only completed milestones have a completion date — set the status to completed",
        },
      ],
    });
  }
  return { status: input.status, completedAt: null };
}

/** Audit verb for a status change: completion and reopening are recorded explicitly. */
export function transitionVerb(
  before: MilestoneStatus,
  after: MilestoneStatus,
): "completed" | "reopened" | "updated" {
  if (before !== "completed" && after === "completed") return "completed";
  if (before === "completed" && after !== "completed") return "reopened";
  return "updated";
}
