import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { createOpportunityService } from "@/modules/opportunities/opportunity.service";
import { analyseSkills } from "@/modules/skills/skill-intelligence.service";

import type { SignalDraft } from "./intelligence.repository";
import {
  dedupeKey,
  daysUntil,
  deadlineSeverity,
  gapSeverity,
  skillFreshness,
  skillSignal,
} from "./intelligence.rules";

/**
 * Deterministic detectors (Phase 13, ADR 0060). Each reads real persisted data, classifies with the
 * pure rules, and returns grounded signal drafts — it never writes. The orchestrator reconciles the
 * drafts into persisted signals idempotently. Explanations reference the actual source records and
 * never assert an unsupported outcome.
 */

/** Skill freshness → signals. Inactivity is reported as "no recent evidence", never "skill lost". */
export async function detectSkillSignals(
  db: PrismaClient,
  userId: string,
  now: Date,
): Promise<SignalDraft[]> {
  const analysed = await analyseSkills(db, userId, now);
  const drafts: SignalDraft[] = [];
  for (const a of analysed) {
    const latest = a.signals.demonstrations.latest;
    const freshness = skillFreshness(latest, now);
    const signal = skillSignal({
      freshness,
      qualifyingEvidence: a.signals.evidence.qualifying,
      active: a.skill.active,
      hasTarget: a.skill.targetLevel !== null && a.skill.targetLevel !== undefined,
    });
    if (!signal) continue;
    const since = latest
      ? `since ${latest.toISOString().slice(0, 10)}`
      : "with no dated demonstration on record";
    drafts.push({
      type: signal.type,
      severity: signal.severity,
      title: `${a.skill.name}: ${freshness === "stale" ? "evidence is stale" : freshness === "aging" ? "evidence is aging" : "no supporting evidence yet"}`,
      explanation:
        `“${a.skill.name}” has ${a.signals.evidence.qualifying} qualifying evidence link(s) and ` +
        `has not received new supporting evidence ${since}. This reflects evidence recency, not a ` +
        `measured decline in ability.`,
      sourceType: "skill",
      sourceId: a.skill.id,
      dedupeKey: dedupeKey.skill(a.skill.id),
      occurredAt: latest,
      metadata: {
        freshness,
        qualifyingEvidence: a.signals.evidence.qualifying,
        latestDemonstration: latest ? latest.toISOString().slice(0, 10) : null,
        targetLevel: a.skill.targetLevel ?? null,
        rule: "freshness-v1",
      },
    });
  }
  return drafts;
}

/**
 * Opportunity intelligence → signals. Reuses the Phase 10 transparent fit (required requirements with
 * no verified evidence = unmet). Emits an evidence-gap signal and, when a deadline is near, a
 * deadline signal. Both reference the opportunity and the concrete unmet requirements.
 */
export async function detectOpportunitySignals(
  db: PrismaClient,
  userId: string,
  now: Date,
): Promise<SignalDraft[]> {
  const opportunities = await db.opportunity.findMany({
    where: { userId, status: { notIn: ["closed", "archived"] } },
    select: { id: true, title: true, deadline: true, status: true },
  });
  if (opportunities.length === 0) return [];
  const svc = createOpportunityService(db);
  const drafts: SignalDraft[] = [];

  for (const opp of opportunities) {
    const fit = await svc.getFit({ userId, requestId: "intel" }, opp.id);
    const unmetRequired = fit.coverage.required.total - fit.coverage.required.supported;
    const unmetLabels = fit.requirements
      .filter((r) => r.importance === "required" && r.status !== "supported")
      .map((r) => r.label);

    const gap = gapSeverity(unmetRequired);
    if (gap) {
      drafts.push({
        type: "opportunity_gap",
        severity: gap,
        title: `${opp.title}: ${unmetRequired} required requirement(s) lack verified evidence`,
        explanation:
          `${fit.coverage.required.supported}/${fit.coverage.required.total} required requirements ` +
          `are supported by verified evidence. Unmet: ${unmetLabels.slice(0, 5).join(", ")}` +
          `${unmetLabels.length > 5 ? "…" : ""}.`,
        sourceType: "opportunity",
        sourceId: opp.id,
        dedupeKey: dedupeKey.opportunityGap(opp.id),
        metadata: {
          requiredTotal: fit.coverage.required.total,
          requiredSupported: fit.coverage.required.supported,
          unmetRequired,
          unmetRequirements: unmetLabels.slice(0, 20),
          rule: "opportunity-gap-v1",
        },
      });
    }

    const d = daysUntil(opp.deadline, now);
    const deadlineSev = deadlineSeverity({
      daysUntil: d,
      unmetRequired,
      active: true,
    });
    if (deadlineSev && d !== null) {
      drafts.push({
        type: "opportunity_deadline",
        severity: deadlineSev,
        title: `${opp.title}: deadline in ${d} day(s)`,
        explanation:
          `Deadline ${opp.deadline?.toISOString().slice(0, 10)} is ${d} day(s) away with ` +
          `${unmetRequired} required requirement(s) still lacking verified evidence.`,
        sourceType: "opportunity",
        sourceId: opp.id,
        dedupeKey: dedupeKey.opportunityDeadline(opp.id),
        occurredAt: opp.deadline,
        metadata: { daysUntil: d, unmetRequired, rule: "opportunity-deadline-v1" },
      });
    }
  }
  return drafts;
}
