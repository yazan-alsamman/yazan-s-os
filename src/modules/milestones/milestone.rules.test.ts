import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors/app-error";
import { parseInput } from "@/lib/validation/parse";

import {
  isOpen,
  isOverdue,
  MILESTONE_STATUSES,
  resolveCompletion,
  transitionVerb,
} from "./milestone.rules";
import { createMilestoneSchema, listMilestonesQuerySchema } from "./milestone.schemas";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
// Late in the UTC day: "today" must still be 2026-10-03, independent of the hour.
const NOW = new Date("2026-10-03T23:59:59.999Z");

describe("milestone overdue rule (ADR 0022)", () => {
  it("is overdue only when open and planned strictly before today (UTC)", () => {
    expect(isOverdue({ status: "planned", dueDate: d("2026-10-02") }, NOW)).toBe(true);
    expect(isOverdue({ status: "in_progress", dueDate: d("2026-01-01") }, NOW)).toBe(true);
    expect(isOverdue({ status: "blocked", dueDate: d("2026-10-02") }, NOW)).toBe(true);
  });

  it("boundaries: due today is not overdue; undated is never overdue", () => {
    expect(isOverdue({ status: "planned", dueDate: d("2026-10-03") }, NOW)).toBe(false);
    expect(isOverdue({ status: "planned", dueDate: d("2026-10-04") }, NOW)).toBe(false);
    expect(isOverdue({ status: "planned", dueDate: null }, NOW)).toBe(false);
    // Midnight UTC is the first instant of the new day.
    expect(
      isOverdue({ status: "planned", dueDate: d("2026-10-02") }, new Date("2026-10-02T23:59:59Z")),
    ).toBe(false);
    expect(
      isOverdue({ status: "planned", dueDate: d("2026-10-02") }, new Date("2026-10-03T00:00:00Z")),
    ).toBe(true);
  });

  it("completed, cancelled and archived-project milestones are never overdue", () => {
    expect(isOverdue({ status: "completed", dueDate: d("2020-01-01") }, NOW)).toBe(false);
    expect(isOverdue({ status: "cancelled", dueDate: d("2020-01-01") }, NOW)).toBe(false);
    expect(isOverdue({ status: "planned", dueDate: d("2020-01-01") }, NOW, "archived")).toBe(false);
    expect(isOverdue({ status: "planned", dueDate: d("2020-01-01") }, NOW, "production")).toBe(
      true,
    );
  });

  it("open statuses are planned, in_progress and blocked", () => {
    expect(MILESTONE_STATUSES.filter(isOpen)).toEqual(["planned", "in_progress", "blocked"]);
  });
});

describe("milestone completion and transitions", () => {
  const fieldError = (fn: () => unknown) => {
    try {
      fn();
    } catch (error) {
      return error instanceof AppError ? error.details?.[0]?.path : "other";
    }
    return null;
  };

  it("completing without a date completes today (UTC calendar day)", () => {
    expect(resolveCompletion({ status: "completed", completedAt: undefined }, NOW)).toEqual({
      status: "completed",
      completedAt: d("2026-10-03"),
    });
  });

  it("keeps an explicit past or same-day completion date and rejects a future one", () => {
    expect(resolveCompletion({ status: "completed", completedAt: d("2026-09-01") }, NOW)).toEqual({
      status: "completed",
      completedAt: d("2026-09-01"),
    });
    expect(
      resolveCompletion({ status: "completed", completedAt: d("2026-10-03") }, NOW).completedAt,
    ).toEqual(d("2026-10-03"));
    expect(
      fieldError(() =>
        resolveCompletion({ status: "completed", completedAt: d("2026-10-04") }, NOW),
      ),
    ).toBe("completedAt");
  });

  it("rejects a completion date on a non-completed milestone; reopening clears the date", () => {
    expect(
      fieldError(() => resolveCompletion({ status: "planned", completedAt: d("2026-09-01") }, NOW)),
    ).toBe("completedAt");
    expect(resolveCompletion({ status: "in_progress", completedAt: null }, NOW)).toEqual({
      status: "in_progress",
      completedAt: null,
    });
  });

  it("records completion and reopening as explicit audit verbs", () => {
    expect(transitionVerb("planned", "completed")).toBe("completed");
    expect(transitionVerb("blocked", "completed")).toBe("completed");
    expect(transitionVerb("completed", "in_progress")).toBe("reopened");
    expect(transitionVerb("completed", "cancelled")).toBe("reopened");
    expect(transitionVerb("planned", "blocked")).toBe("updated");
    expect(transitionVerb("completed", "completed")).toBe("updated");
  });
});

describe("milestone input validation", () => {
  it("accepts the spec fields and strips ownership identifiers", () => {
    const input = parseInput(createMilestoneSchema, {
      title: "  Beta release ",
      dueDate: "2026-11-01",
      userId: "00000000-0000-0000-0000-000000000000",
      projectId: "00000000-0000-0000-0000-000000000000",
    }) as Record<string, unknown>;
    expect(input).toEqual({ title: "Beta release", dueDate: d("2026-11-01") });
  });

  it("rejects blank titles, invalid dates and unknown statuses", () => {
    expect(() => parseInput(createMilestoneSchema, { title: "  " })).toThrow();
    expect(() =>
      parseInput(createMilestoneSchema, { title: "x", dueDate: "2026-02-30" }),
    ).toThrow();
    expect(() => parseInput(createMilestoneSchema, { title: "x", status: "done" })).toThrow();
    expect(() => parseInput(createMilestoneSchema, { title: "x".repeat(201) })).toThrow();
  });

  it("list filters are validated and the page size is bounded", () => {
    expect(parseInput(listMilestonesQuerySchema, { overdue: "true" }).overdue).toBe(true);
    expect(() => parseInput(listMilestonesQuerySchema, { pageSize: "1000" })).toThrow();
    expect(() => parseInput(listMilestonesQuerySchema, { projectId: "nope" })).toThrow();
    expect(() => parseInput(listMilestonesQuerySchema, { sort: "userId" })).toThrow();
  });
});
