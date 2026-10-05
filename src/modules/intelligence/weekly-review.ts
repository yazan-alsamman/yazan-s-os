import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";

import { describeDelta, weekWindows } from "./intelligence.rules";

/**
 * Deterministic weekly executive review (Phase 13, ADR 0060). Aggregates real PEOS data for the ISO
 * week vs the previous week. Idempotent per (userId, weekStart): re-running updates the same row.
 * Data-coverage caveats are explicit — a quiet or partially-synchronized week is marked `partial`
 * and never presented as a confident "nothing happened" conclusion.
 */

const DAY_MS = 86_400_000;

export async function generateWeeklyReview(
  db: PrismaClient,
  userId: string,
  now: Date,
  weekDate?: Date,
): Promise<{
  weekStart: Date;
  weekEnd: Date;
  status: string;
  coverage: unknown;
  summary: unknown;
}> {
  const { start, endExclusive, prevStart, prevEndExclusive } = weekWindows(weekDate ?? now);
  const weekEnd = new Date(endExclusive.getTime() - DAY_MS);

  const inWeek = { gte: start, lt: endExclusive };
  const inPrev = { gte: prevStart, lt: prevEndExclusive };

  const [
    evidenceThis,
    evidencePrev,
    acceptedThis,
    commitsThis,
    commitsPrev,
    projectsUpdated,
    githubConn,
    upcomingDeadlines,
    activeSignals,
    newSignalsThis,
  ] = await Promise.all([
    db.evidence.count({ where: { userId, createdAt: inWeek } }),
    db.evidence.count({ where: { userId, createdAt: inPrev } }),
    db.evidenceCandidate.count({ where: { userId, status: "accepted", reviewedAt: inWeek } }),
    db.gitHubCommit.count({ where: { userId, authoredAt: inWeek } }),
    db.gitHubCommit.count({ where: { userId, authoredAt: inPrev } }),
    db.project.count({ where: { userId, updatedAt: inWeek } }),
    db.integrationConnection.findFirst({
      where: { userId, provider: "github" },
      select: { status: true, lastSyncAt: true },
    }),
    db.opportunity.findMany({
      where: {
        userId,
        status: { notIn: ["closed", "archived"] },
        deadline: { gte: start, lt: new Date(endExclusive.getTime() + 14 * DAY_MS) },
      },
      select: { id: true, title: true, deadline: true },
      orderBy: { deadline: "asc" },
      take: 10,
    }),
    db.intelligenceSignal.groupBy({
      by: ["severity"],
      where: { userId, status: "active" },
      _count: { _all: true },
    }),
    db.intelligenceSignal.count({ where: { userId, status: "active", detectedAt: inWeek } }),
  ]);

  const githubConnected = Boolean(githubConn);
  const githubStale = githubConnected && (!githubConn?.lastSyncAt || githubConn.lastSyncAt < start);

  // Coverage: if GitHub is connected but not synchronized within the week, engineering-activity
  // counts are not trustworthy for this week → mark the review partial rather than concluding "quiet".
  const coverage = {
    githubConnected,
    githubLastSyncAt: githubConn?.lastSyncAt?.toISOString() ?? null,
    githubStale,
    reasons: githubStale
      ? ["GitHub activity may be incomplete: last sync is before this week."]
      : [],
  };
  const status = githubStale ? "partial" : "generated";

  const summary = {
    window: { start: start.toISOString().slice(0, 10), end: weekEnd.toISOString().slice(0, 10) },
    changed: {
      evidenceCreated: {
        current: evidenceThis,
        previous: evidencePrev,
        delta: describeDelta(evidenceThis, evidencePrev),
      },
      evidenceAccepted: acceptedThis,
      commits: githubConnected
        ? {
            current: commitsThis,
            previous: commitsPrev,
            delta: describeDelta(commitsThis, commitsPrev),
          }
        : null,
      projectsUpdated,
    },
    attention: {
      activeSignals: Object.fromEntries(activeSignals.map((s) => [s.severity, s._count._all])),
      newThisWeek: newSignalsThis,
      upcomingDeadlines: upcomingDeadlines.map((o) => ({
        id: o.id,
        title: o.title,
        deadline: o.deadline ? o.deadline.toISOString().slice(0, 10) : null,
      })),
    },
    rule: "weekly-review-v1",
  };

  return { weekStart: start, weekEnd, status, coverage, summary };
}
