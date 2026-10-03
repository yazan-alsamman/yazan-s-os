import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors/app-error";
import { parseInput } from "@/lib/validation/parse";

import {
  assertTransition,
  createsSupersessionCycle,
  DECISION_STATUSES,
  DECISION_TRANSITIONS,
  decisionTransitionVerb,
  documentationGaps,
  isRevisitDue,
  isStaleCritical,
  resolveDecisionState,
  revisitExplanation,
} from "./architecture.rules";
import { createDecisionSchema, mapQuerySchema, updateDecisionSchema } from "./architecture.schemas";

const NOW = new Date("2026-10-03T22:30:00Z");
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const pathOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? (e.details?.[0]?.path ?? e.code) : "other";
  }
  return null;
};

describe("decision lifecycle (decision-lifecycle-v1)", () => {
  it("allows exactly the transition table; same-status is allowed", () => {
    for (const from of DECISION_STATUSES) {
      for (const to of DECISION_STATUSES) {
        const legal = from === to || DECISION_TRANSITIONS[from].includes(to);
        expect(pathOf(() => assertTransition(from, to)) === null, `${from}->${to}`).toBe(legal);
      }
    }
    // A proposal cannot be superseded or deprecated before it is accepted.
    expect(pathOf(() => assertTransition("proposed", "superseded"))).toBe("status");
    expect(pathOf(() => assertTransition("rejected", "accepted"))).toBe("status");
  });

  it("status-dependent fields: decision date and superseding decision", () => {
    expect(
      resolveDecisionState(
        { status: "proposed", decidedAt: d("2026-09-01"), supersededById: "x" },
        NOW,
      ),
    ).toEqual({
      decidedAt: null,
      supersededById: null,
    });
    expect(
      resolveDecisionState({ status: "accepted", decidedAt: undefined, supersededById: null }, NOW)
        .decidedAt,
    ).toEqual(d("2026-10-03"));
    expect(
      pathOf(() =>
        resolveDecisionState(
          { status: "accepted", decidedAt: d("2026-12-01"), supersededById: null },
          NOW,
        ),
      ),
    ).toBe("decidedAt");
    expect(
      pathOf(() =>
        resolveDecisionState(
          { status: "superseded", decidedAt: d("2026-01-01"), supersededById: null },
          NOW,
        ),
      ),
    ).toBe("supersededById");
    // Reinstating clears the supersession link (the audit log keeps it).
    expect(
      resolveDecisionState(
        { status: "accepted", decidedAt: d("2026-01-01"), supersededById: "y" },
        NOW,
      ).supersededById,
    ).toBeNull();
  });

  it("audit verbs describe the transition", () => {
    expect(decisionTransitionVerb("proposed", "accepted")).toBe("accepted");
    expect(decisionTransitionVerb("accepted", "superseded")).toBe("superseded");
    expect(decisionTransitionVerb("accepted", "deprecated")).toBe("deprecated");
    expect(decisionTransitionVerb("superseded", "accepted")).toBe("restored");
    expect(decisionTransitionVerb("rejected", "proposed")).toBe("restored");
    expect(decisionTransitionVerb("accepted", "accepted")).toBe("updated");
  });

  it("supersession can never form a cycle", () => {
    // B superseded by C.
    const chain = new Map<string, string | null>([["B", "C"]]);
    expect(createsSupersessionCycle(chain, "A", "A")).toBe(true);
    expect(createsSupersessionCycle(chain, "A", "B")).toBe(false); // A ← B ← C is a chain
    expect(createsSupersessionCycle(chain, "C", "B")).toBe(true); // C superseded by B, B by C
    // Long chains terminate (each decision visited once).
    const long = new Map<string, string | null>(
      Array.from({ length: 2000 }, (_, i) => [`n${i}`, `n${i + 1}`] as [string, string]),
    );
    expect(createsSupersessionCycle(long, "n2000", "n0")).toBe(true);
    expect(createsSupersessionCycle(long, "x", "n0")).toBe(false);
  });
});

describe("revisit and stale-critical (revisit-v1)", () => {
  it("only accepted decisions with a passed revisit date are due (UTC day boundary)", () => {
    expect(isRevisitDue({ status: "accepted", revisitDate: d("2026-10-02") }, NOW)).toBe(true);
    expect(isRevisitDue({ status: "accepted", revisitDate: d("2026-10-03") }, NOW)).toBe(false);
    expect(isRevisitDue({ status: "accepted", revisitDate: null }, NOW)).toBe(false);
    expect(isRevisitDue({ status: "superseded", revisitDate: d("2020-01-01") }, NOW)).toBe(false);
    expect(isRevisitDue({ status: "proposed", revisitDate: d("2020-01-01") }, NOW)).toBe(false);
  });

  it("stale critical needs a due revisit AND a critical component — never age alone", () => {
    const due = { status: "accepted" as const, revisitDate: d("2026-01-01") };
    expect(isStaleCritical(due, 1, NOW)).toBe(true);
    expect(isStaleCritical(due, 0, NOW)).toBe(false);
    expect(isStaleCritical({ status: "accepted", revisitDate: null }, 3, NOW)).toBe(false);
    expect(revisitExplanation(due, 2, NOW)).toMatch(/2 critical components/);
    expect(revisitExplanation({ status: "accepted", revisitDate: null }, 0, NOW)).toMatch(
      /No revisit date/,
    );
  });
});

describe("documentation gaps (documentation-gaps-v1) — a list, never a score", () => {
  const base = {
    status: "accepted" as const,
    context: "c",
    decision: "d",
    consequences: "q",
    alternatives: 1,
    projects: 1,
    evidence: 1,
  };
  it("lists exactly the missing parts", () => {
    expect(documentationGaps(base)).toEqual([]);
    expect(documentationGaps({ ...base, consequences: "  ", evidence: 0 })).toEqual([
      "consequences",
      "evidence",
    ]);
    expect(documentationGaps({ ...base, alternatives: 0, projects: 0 })).toEqual([
      "alternatives",
      "projects",
    ]);
  });
  it("proposals are not yet expected to have a decision or consequences", () => {
    expect(
      documentationGaps({ ...base, status: "proposed", decision: null, consequences: null }),
    ).toEqual([]);
  });
});

describe("validation", () => {
  it("strips injected ownership, limits create status and bounds the map", () => {
    const parsed = parseInput(createDecisionSchema, { title: "T", userId: "x" } as Record<
      string,
      unknown
    >);
    expect("userId" in parsed).toBe(false);
    expect(() => parseInput(createDecisionSchema, { title: "T", status: "superseded" })).toThrow();
    expect(() => parseInput(updateDecisionSchema, {})).toThrow();
    expect(parseInput(mapQuerySchema, {}).limit).toBe(100);
    expect(() => parseInput(mapQuerySchema, { limit: "1000" })).toThrow();
  });
});
