import type { PrismaClient } from "@/generated/prisma/client";
import {
  analyseComponents,
  analyseDecisions,
  matchesDecisionDerived,
  type AnalysedComponent,
  type AnalysedDecision,
} from "@/modules/architecture/architecture-intelligence";
import {
  COMPONENT_TYPE_LABEL,
  COMPONENT_TYPES,
  DECISION_STATUS_LABEL,
  DECISION_STATUSES,
} from "@/modules/architecture/architecture.rules";
import type {
  ListComponentsQuery,
  ListDecisionsQuery,
} from "@/modules/architecture/architecture.schemas";
import { utcDay } from "@/modules/shared/calendar";
import { toDateOnly } from "@/modules/shared/fields";
import type { ServiceContext } from "@/modules/shared/service-context";

import { metricResult } from "./metric-result";

/**
 * Architecture analytics (Phase 7, ADR 0045). Every governed metric is computed from one analysed
 * set with the same predicate as its source list (decisions, components or projects), so each
 * value equals its drill-down list total (integration-tested). Nothing is scored or inferred.
 */
type DQuery = Partial<ListDecisionsQuery>;
type CQuery = Partial<ListComponentsQuery>;

const t = (d: Date | null) => (d ? d.getTime() : null);

/** In-memory mirror of `decisionWhere` + `matchesDecisionDerived`. */
export function matchesDecisionQuery(a: AnalysedDecision, q: DQuery): boolean {
  const d = a.decision;
  if (q.status && d.status !== q.status) return false;
  if (q.inForce !== undefined && (d.status === "accepted") !== q.inForce) return false;
  if (q.hasProjects !== undefined && a.signals.projects > 0 !== q.hasProjects) return false;
  if (q.hasEvidence !== undefined && a.signals.evidence > 0 !== q.hasEvidence) return false;
  if (q.hasAlternatives !== undefined && a.signals.alternatives > 0 !== q.hasAlternatives)
    return false;
  if (q.decidedFrom || q.decidedTo) {
    const v = t(d.decidedAt);
    if (v === null) return false;
    if (q.decidedFrom && v < q.decidedFrom.getTime()) return false;
    if (q.decidedTo && v > q.decidedTo.getTime()) return false;
  }
  return matchesDecisionDerived(a, q);
}

/** In-memory mirror of `componentWhere` for the metric predicates. */
export function matchesComponentQuery(a: AnalysedComponent, q: CQuery): boolean {
  const c = a.component;
  if (q.type && c.type !== q.type) return false;
  if (q.critical !== undefined && c.critical !== q.critical) return false;
  if (q.hasDecisions !== undefined && a.signals.decisions > 0 !== q.hasDecisions) return false;
  return true;
}

export function createArchitectureAnalyticsService(
  db: PrismaClient,
  clock: () => Date = () => new Date(),
) {
  return {
    async summary(ctx: ServiceContext) {
      const now = clock();
      const userId = ctx.userId;
      const [decisions, components, projects, covered] = await Promise.all([
        analyseDecisions(db, userId, now),
        analyseComponents(db, userId),
        db.project.count({ where: { userId } }),
        // Same predicate as GET /api/v1/projects?hasArchitecture=true.
        db.project.count({ where: { userId, architectureDecisions: { some: {} } } }),
      ]);
      const dc = (q: DQuery) => decisions.filter((a) => matchesDecisionQuery(a, q)).length;
      const cc = (q: CQuery) => components.filter((a) => matchesComponentQuery(a, q)).length;
      const hasD = decisions.length > 0;
      const hasC = components.length > 0;
      const noD = "No architecture decisions yet.";
      const noC = "No architecture components yet.";
      const md = (key: string, value: number) =>
        metricResult(key, { value, hasBaseRecords: hasD, noDataReason: noD });
      const mc = (key: string, value: number) =>
        metricResult(key, { value, hasBaseRecords: hasC, noDataReason: noC });

      // Decision timeline: decided decisions per UTC month (undated proposals are excluded).
      const months = new Map<string, number>();
      for (const a of decisions) {
        if (!a.decision.decidedAt) continue;
        const key = a.decision.decidedAt.toISOString().slice(0, 7);
        months.set(key, (months.get(key) ?? 0) + 1);
      }
      const timeline = [...months.entries()].sort((x, y) => x[0].localeCompare(y[0]));

      const attention = (pred: (a: AnalysedDecision) => boolean) =>
        decisions
          .filter(pred)
          .sort(
            (x, y) =>
              (x.decision.revisitDate?.getTime() ?? 0) - (y.decision.revisitDate?.getTime() ?? 0) ||
              x.decision.title.localeCompare(y.decision.title),
          )
          .slice(0, 10)
          .map((a) => ({
            id: a.decision.id,
            title: a.decision.title,
            revisitDate: toDateOnly(a.decision.revisitDate),
            criticalComponents: a.signals.criticalComponents,
          }));

      return {
        calculatedAt: now.toISOString(),
        evaluatedOn: toDateOnly(utcDay(now))!,
        recordCounts: { decisions: decisions.length, components: components.length, projects },

        decisions: md("architecture.decisions", decisions.length),
        inForce: md("architecture.decisions_in_force", dc({ inForce: true })),
        revisitDue: md("architecture.revisit_due", dc({ revisitDue: true })),
        staleCritical: md("architecture.stale_critical_decisions", dc({ staleCritical: true })),
        withoutEvidence: md("architecture.decisions_without_evidence", dc({ hasEvidence: false })),
        withGaps: md("architecture.decisions_with_gaps", dc({ incomplete: true })),
        status: metricResult("architecture.decisions_by_status", {
          value: decisions.length,
          hasBaseRecords: hasD,
          noDataReason: noD,
          breakdown: DECISION_STATUSES.map((s) => ({
            key: s,
            label: DECISION_STATUS_LABEL[s],
            value: dc({ status: s }),
          })),
        }),
        timeline: metricResult("architecture.decision_timeline", {
          value: timeline.reduce((s, [, v]) => s + v, 0),
          hasBaseRecords: hasD,
          noDataReason: noD,
          insufficientReason: timeline.length ? null : "No decision has a decision date yet.",
          breakdown: timeline.map(([key, value]) => ({ key, label: key, value })),
        }),
        projectCoverage: metricResult("architecture.project_coverage", {
          value: projects ? covered / projects : 0,
          hasBaseRecords: projects > 0,
          noDataReason: "No projects yet.",
          breakdown: [
            { key: "covered", label: "With a linked decision", value: covered },
            { key: "uncovered", label: "Without", value: projects - covered },
          ],
        }),
        components: mc("architecture.components", components.length),
        critical: mc("architecture.critical_components", cc({ critical: true })),
        componentsWithoutDecisions: mc(
          "architecture.components_without_decisions",
          cc({ hasDecisions: false }),
        ),
        componentTypes: metricResult("architecture.components_by_type", {
          value: components.length,
          hasBaseRecords: hasC,
          noDataReason: noC,
          breakdown: COMPONENT_TYPES.map((k) => ({
            key: k,
            label: COMPONENT_TYPE_LABEL[k],
            value: cc({ type: k }),
          })),
        }),

        attention: {
          staleCritical: attention((a) => a.staleCritical),
          revisitDue: attention((a) => a.revisitDue && !a.staleCritical),
        },
      };
    },
  };
}

export type ArchitectureAnalyticsDto = Awaited<
  ReturnType<ReturnType<typeof createArchitectureAnalyticsService>["summary"]>
>;
