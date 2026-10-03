import { describe, expect, it } from "vitest";

import { bucketHref, metricHref } from "@/components/command-center/drilldown";
import type { ArchitectureDecision } from "@/generated/prisma/client";
import { matchesDecisionQuery } from "@/modules/analytics/architecture-analytics.service";

import {
  matchesDecisionDerived,
  sortDecisions,
  type AnalysedDecision,
  type DecisionSignals,
} from "./architecture-intelligence";
import { documentationGaps, isRevisitDue, isStaleCritical } from "./architecture.rules";

const NOW = new Date("2026-10-03T12:00:00Z");
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function make(
  over: Partial<ArchitectureDecision> & { id: string; title: string },
  sig: Partial<DecisionSignals> = {},
): AnalysedDecision {
  const decision = {
    userId: "u",
    context: "ctx",
    problem: null,
    constraints: null,
    decision: "dec",
    consequences: "con",
    status: "accepted",
    decidedAt: d("2026-01-01"),
    revisitDate: null,
    supersededById: null,
    createdAt: d("2026-01-01"),
    updatedAt: d("2026-01-01"),
    ...over,
  } as ArchitectureDecision;
  const signals: DecisionSignals = {
    projects: 1,
    evidence: 1,
    alternatives: 1,
    components: 0,
    criticalComponents: 0,
    ...sig,
  };
  return {
    decision,
    signals,
    revisitDue: isRevisitDue(decision, NOW),
    staleCritical: isStaleCritical(decision, signals.criticalComponents, NOW),
    gaps: documentationGaps({ ...decision, ...signals }),
  };
}

const a = make(
  { id: "a", title: "Use Postgres", revisitDate: d("2026-06-01"), decidedAt: d("2026-02-10") },
  { components: 2, criticalComponents: 1 },
);
const b = make(
  { id: "b", title: "Kafka", revisitDate: d("2026-08-01"), decidedAt: d("2026-05-01") },
  { evidence: 0 },
);
const c = make({
  id: "c",
  title: "Proposal",
  status: "proposed",
  decidedAt: null,
  decision: null,
  consequences: null,
});
const s = make({
  id: "s",
  title: "Old queue",
  status: "superseded",
  supersededById: "b",
  decidedAt: d("2025-11-01"),
});
const ALL = [a, b, c, s];

describe("decision ordering is deterministic", () => {
  it("newest decision first, undated proposals last; stable across input order", () => {
    expect(sortDecisions(ALL, "decidedAt").map((x) => x.decision.id)).toEqual(["b", "a", "s", "c"]);
    expect(sortDecisions([...ALL].reverse(), "title").map((x) => x.decision.id)).toEqual(
      sortDecisions(ALL, "title").map((x) => x.decision.id),
    );
    expect(
      sortDecisions(ALL, "revisitDate")
        .map((x) => x.decision.id)
        .slice(0, 2),
    ).toEqual(["a", "b"]);
  });
});

describe("list and metric predicates are the same function (ADR 0045)", () => {
  const ids = (q: Parameters<typeof matchesDecisionQuery>[1]) =>
    ALL.filter((x) => matchesDecisionQuery(x, q))
      .map((x) => x.decision.id)
      .sort();
  it("structural and derived filters", () => {
    expect(ids({ inForce: true })).toEqual(["a", "b"]);
    expect(ids({ status: "superseded" })).toEqual(["s"]);
    expect(ids({ revisitDue: true })).toEqual(["a", "b"]);
    expect(ids({ staleCritical: true })).toEqual(["a"]);
    expect(ids({ hasEvidence: false })).toEqual(["b"]);
    expect(ids({ decidedFrom: d("2026-02-01"), decidedTo: d("2026-02-28") })).toEqual(["a"]);
    expect(ids({ incomplete: true })).toEqual(["b"]); // b lacks evidence; the proposal is complete for a draft
    expect(matchesDecisionDerived(a, { staleCritical: true, revisitDue: true })).toBe(true);
  });
});

describe("architecture drill-downs", () => {
  const none = { from: null, to: null };
  it("single metrics open the exact source list", () => {
    expect(metricHref("architecture.decisions", {}, none)).toBe("/architecture");
    expect(metricHref("architecture.decisions_in_force", {}, none)).toBe(
      "/architecture?inForce=true",
    );
    expect(metricHref("architecture.stale_critical_decisions", {}, none)).toBe(
      "/architecture?staleCritical=true&sort=revisitDate",
    );
    expect(metricHref("architecture.project_coverage", {}, none)).toBe(
      "/projects?hasArchitecture=true",
    );
    expect(metricHref("architecture.components_without_decisions", {}, none)).toBe(
      "/architecture/components?hasDecisions=false",
    );
  });
  it("buckets map to the list predicate; invalid months have none", () => {
    expect(bucketHref("architecture.decisions_by_status", "superseded", {})).toBe(
      "/architecture?status=superseded",
    );
    expect(bucketHref("architecture.components_by_type", "queue", {})).toBe(
      "/architecture/components?type=queue",
    );
    expect(bucketHref("architecture.decision_timeline", "2026-02", {})).toBe(
      "/architecture?decidedFrom=2026-02-01&decidedTo=2026-02-28",
    );
    expect(bucketHref("architecture.decision_timeline", "2026-13", {})).toBeNull();
  });
});
