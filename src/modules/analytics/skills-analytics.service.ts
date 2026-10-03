import { z } from "zod";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { utcDay } from "@/modules/shared/calendar";
import { toDateOnly } from "@/modules/shared/fields";
import type { ServiceContext } from "@/modules/shared/service-context";
import {
  analyseSkills,
  MAX_RADAR_SKILLS,
  matchesQuery,
  toIntelligenceRow,
  type SkillIntelligenceRow,
} from "@/modules/skills/skill-intelligence.service";

import { metricResult, type DistributionBucket } from "./metric-result";

/**
 * Career analytics (Phase 4, ADRs 0027–0029). Every metric is computed from the same analysed rows
 * that the skill-intelligence list returns, through the same filter predicate (`matchesQuery`), so
 * each count equals the total of its drill-down list. Distributions cover active skills.
 */
export const skillsAnalyticsFiltersSchema = z.object({
  category: z.string().trim().min(1).max(80).optional(),
});

const FRESHNESS = [
  ["fresh", "Fresh (≤ 365 days)"],
  ["aging", "Aging (366–730 days)"],
  ["stale", "Stale (> 730 days)"],
  ["no_dated_evidence", "No dated evidence"],
  ["no_evidence", "No evidence"],
] as const;
const LEVEL_BUCKETS = ["5", "4", "3", "2", "1", "none"] as const;
const GAPS = [
  ["below_target", "Below target"],
  ["at_target", "At target"],
  ["above_target", "Above target"],
  ["not_computable", "Target without evidence"],
  ["no_target", "No target"],
] as const;
const TRENDS = [
  ["increasing", "More demonstrations"],
  ["stable", "As many demonstrations"],
  ["decreasing", "Fewer demonstrations"],
  ["insufficient_history", "Insufficient history"],
] as const;

type Query = Parameters<typeof matchesQuery>[1];

export function createSkillsAnalyticsService(
  db: PrismaClient,
  clock: () => Date = () => new Date(),
) {
  return {
    async summary(ctx: ServiceContext, filters: z.infer<typeof skillsAnalyticsFiltersSchema>) {
      const now = clock();
      const where: Prisma.SkillWhereInput = filters.category
        ? { category: { equals: filters.category, mode: "insensitive" } }
        : {};
      const all = await analyseSkills(db, ctx.userId, now, where);
      const rows = all.map(toIntelligenceRow);
      const count = (q: Query) => rows.filter((r) => matchesQuery(r, q)).length;
      const active = rows.filter((r) => r.active);
      const hasSkills = rows.length > 0;
      const noSkills = filters.category ? "No skills in this category." : "No skills yet.";
      const filtersApplied = filters.category ? [`Category: ${filters.category}`] : [];
      const dist = (
        key: string,
        buckets: readonly (readonly [string, string])[],
        q: (bucket: string) => Query,
      ) =>
        metricResult(key, {
          value: active.length,
          hasBaseRecords: hasSkills,
          noDataReason: noSkills,
          filtersApplied,
          breakdown: buckets.map(([bucket, label]) => ({
            key: bucket,
            label,
            value: count({ active: true, ...q(bucket) }),
          })),
        });

      // Coverage: fresh target skills / target skills (active). Never 0% for an empty denominator.
      const targets = count({ active: true, hasTarget: true });
      const freshTargets = count({ active: true, hasTarget: true, freshness: "fresh" });
      const coverage = metricResult("skills.coverage", {
        value: targets ? freshTargets / targets : 0,
        hasBaseRecords: hasSkills,
        noDataReason: noSkills,
        insufficientReason: targets ? null : "No active skill has a target level (1–5).",
        filtersApplied,
        breakdown: [
          { key: "fresh", label: "Fresh target skills", value: freshTargets },
          { key: "other", label: "Other target skills", value: targets - freshTargets },
        ],
      });

      const radarRows = active
        .filter((r) => r.current.level !== null)
        .sort(
          (a, b) =>
            Number(b.target.level !== null && b.target.level >= 1) -
              Number(a.target.level !== null && a.target.level >= 1) ||
            (b.current.level ?? 0) - (a.current.level ?? 0) ||
            a.name.localeCompare(b.name) ||
            a.id.localeCompare(b.id),
        );
      const plotted = radarRows.slice(0, MAX_RADAR_SKILLS);
      const notPlotted = active.filter((r) => r.current.level === null);

      return {
        calculatedAt: now.toISOString(),
        evaluatedOn: toDateOnly(utcDay(now)),
        recordCounts: { skills: rows.length, active: active.length },
        filtersApplied,
        coverage,
        criticalGaps: metricResult("skills.critical_gaps", {
          value: count({ critical: true }),
          hasBaseRecords: hasSkills,
          noDataReason: noSkills,
          filtersApplied,
        }),
        targetsWithoutEvidence: metricResult("skills.targets_without_evidence", {
          value: count({ active: true, targetWithoutEvidence: true }),
          hasBaseRecords: hasSkills,
          noDataReason: noSkills,
          filtersApplied,
        }),
        productionEvidence: metricResult("skills.production_evidence", {
          value: count({ active: true, productionLinked: true }),
          hasBaseRecords: hasSkills,
          noDataReason: noSkills,
          filtersApplied,
        }),
        freshness: dist("skills.freshness", FRESHNESS, (b) => ({
          freshness: b as Query["freshness"],
        })),
        levels: dist(
          "skills.level_distribution",
          LEVEL_BUCKETS.map(
            (b) => [b, b === "none" ? "Not enough evidence" : `Level ${b}`] as const,
          ),
          (b) => ({ level: b as Query["level"] }),
        ),
        gaps: dist("skills.gap_distribution", GAPS, (b) => ({ gap: b as Query["gap"] })),
        trend: dist("skills.growth", TRENDS, (b) => ({ trend: b as Query["trend"] })),
        radar: {
          ...metricResult("skills.radar", {
            value: plotted.length,
            hasBaseRecords: hasSkills,
            noDataReason: noSkills,
            insufficientReason: plotted.length
              ? null
              : "No active skill has an evidence-derived level yet.",
            filtersApplied,
          }),
          axes: plotted.map(radarAxis),
          omitted: {
            withoutLevel: notPlotted.length,
            withoutLevelNames: notPlotted.slice(0, 10).map((r) => ({ id: r.id, name: r.name })),
            beyondLimit: Math.max(0, radarRows.length - MAX_RADAR_SKILLS),
          },
        },
        attention: rows
          .filter((r) => r.gap.critical)
          .sort((a, b) => (b.gap.value ?? 0) - (a.gap.value ?? 0) || a.name.localeCompare(b.name))
          .slice(0, 10)
          .map((r) => ({ id: r.id, name: r.name, gap: r.gap.value, freshness: r.freshness.state })),
      };
    },
  };
}

function radarAxis(r: SkillIntelligenceRow) {
  return {
    id: r.id,
    name: r.name,
    current: r.current.level!,
    currentLabel: r.current.label,
    target: r.target.level !== null && r.target.level >= 1 ? r.target.level : null,
    targetLabel: r.target.label,
  };
}

export type SkillsAnalyticsDto = Awaited<
  ReturnType<ReturnType<typeof createSkillsAnalyticsService>["summary"]>
>;
export type { DistributionBucket };
