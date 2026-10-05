import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { createOpportunityService } from "@/modules/opportunities/opportunity.service";
import { analyseSkills } from "@/modules/skills/skill-intelligence.service";

import { skillFreshness } from "./intelligence.rules";

/**
 * Grounded, personalized learning plan (Phase 13, ADR 0060). Derived only from real records: skill
 * targets vs evidence-derived level, evidence freshness, and unmet *required* opportunity
 * requirements. Every item cites the records that justify it and names the evidence that would close
 * the gap — never a generic "learn X". If no gaps exist, the plan is empty (not padded).
 */

interface PlanItem {
  priority: "high" | "medium" | "low";
  focus: string;
  why: string;
  evidenceSays: string;
  suggestedAction: string;
  evidenceGoal: string;
  refs: string[];
}

export async function generateLearningPlan(db: PrismaClient, userId: string, now: Date) {
  const analysed = await analyseSkills(db, userId, now);
  const items: PlanItem[] = [];

  // 1) Skill gaps: a target is set and the evidence-derived level is below it (or absent).
  for (const a of analysed) {
    const target = a.skill.targetLevel;
    if (target === null || target === undefined) continue;
    const derived = a.analysis.derived.level;
    const belowTarget = derived === null || derived < target;
    if (!belowTarget) continue;
    const freshness = skillFreshness(a.signals.demonstrations.latest, now);
    items.push({
      priority: derived === null ? "high" : target - (derived ?? 0) >= 2 ? "high" : "medium",
      focus: a.skill.name,
      why: `Target level ${target} is set; evidence-derived level is ${derived ?? "none"}.`,
      evidenceSays: `${a.signals.evidence.qualifying} qualifying evidence link(s); freshness: ${freshness}.`,
      suggestedAction: `Build or practise ${a.skill.name} in a project and record the work.`,
      evidenceGoal: `Produce verified evidence demonstrating ${a.skill.name} at level ${target}.`,
      refs: [`skill:${a.skill.id}`],
    });
  }

  // 2) Opportunity-driven gaps: unmet required requirements linked to a concrete skill.
  const opportunities = await db.opportunity.findMany({
    where: { userId, status: { notIn: ["closed", "archived"] } },
    select: { id: true, title: true },
  });
  const svc = createOpportunityService(db);
  for (const opp of opportunities) {
    const fit = await svc.getFit({ userId, requestId: "intel" }, opp.id);
    for (const r of fit.requirements) {
      if (r.importance !== "required" || r.status === "supported") continue;
      items.push({
        priority: r.status === "unsupported" ? "high" : "medium",
        focus: r.skill?.name ?? r.label,
        why: `Opportunity “${opp.title}” requires “${r.label}” (required), currently ${r.status}.`,
        evidenceSays: `${r.evidence.length} evidence item(s) mapped; ${r.evidence.filter((e) => e.verified).length} verified.`,
        suggestedAction: r.skill
          ? `Demonstrate ${r.skill.name} and map the resulting evidence to this requirement.`
          : `Produce evidence addressing “${r.label}” and map it to this requirement.`,
        evidenceGoal: `A verified evidence item mapped to requirement “${r.label}”.`,
        refs: [`opportunity:${opp.id}`, ...(r.skill ? [`skill:${r.skill.id}`] : [])],
      });
    }
  }

  const rank = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => rank[a.priority] - rank[b.priority]);
  return { generatedAt: now.toISOString(), items, rule: "learning-plan-v1" };
}
