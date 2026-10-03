import type { ComponentType, DecisionStatus } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors/app-error";
import { utcDay } from "@/modules/shared/calendar";
import { toDateOnly } from "@/modules/shared/fields";

/**
 * Architecture Intelligence rules (Phase 7). Pure, deterministic and unit-tested. Every decision is
 * documented by the owner — PEOS never generates, infers or ranks architecture decisions.
 *
 *   decision-lifecycle-v1     ADR 0042   explicit transitions; supersession preserves history
 *   revisit-v1                ADR 0044   revisit due = accepted AND revisitDate < today (UTC)
 *   documentation-gaps-v1     ADR 0044   explicit missing-part list, no score
 */
export const DECISION_STATUSES = [
  "proposed",
  "accepted",
  "rejected",
  "deprecated",
  "superseded",
] as const satisfies readonly DecisionStatus[];

export const COMPONENT_TYPES = [
  "service",
  "database",
  "queue",
  "external_api",
  "ai_model",
  "infrastructure",
] as const satisfies readonly ComponentType[];

export const MAX_DECISIONS_PER_USER = 2_000;
export const MAX_COMPONENTS_PER_USER = 1_000;
export const MAX_ALTERNATIVES_PER_DECISION = 50;
export const MAP_NODE_LIMIT = 150;

export const DECISION_STATUS_LABEL: Record<DecisionStatus, string> = {
  proposed: "Proposed",
  accepted: "Accepted",
  rejected: "Rejected",
  deprecated: "Deprecated",
  superseded: "Superseded",
};

export const COMPONENT_TYPE_LABEL: Record<ComponentType, string> = {
  service: "Service",
  database: "Database",
  queue: "Queue",
  external_api: "External API",
  ai_model: "AI model",
  infrastructure: "Infrastructure",
};

/** In force: the decision currently governs the architecture. */
export const isInForce = (status: DecisionStatus) => status === "accepted";

// ── Lifecycle (decision-lifecycle-v1) ────────────────────────────────────────

/** ADR 0042. Same-status updates are always allowed; no transition deletes anything. */
export const DECISION_TRANSITIONS: Record<DecisionStatus, readonly DecisionStatus[]> = {
  proposed: ["accepted", "rejected"],
  accepted: ["deprecated", "superseded"],
  rejected: ["proposed"], // reconsider
  deprecated: ["accepted"], // reinstate
  superseded: ["accepted"], // reinstate (the supersession link is cleared, the audit keeps it)
};

export function assertTransition(from: DecisionStatus, to: DecisionStatus) {
  if (from === to || DECISION_TRANSITIONS[from].includes(to)) return;
  throw new AppError("VALIDATION_FAILED", {
    details: [{ path: "status", message: `A decision cannot move from ${from} to ${to}` }],
  });
}

/**
 * Status-dependent fields: a proposal has no decision date and no superseding decision; every
 * decided state has a decision date (default today, never in the future); superseded ⇔ a
 * superseding decision is recorded.
 */
export function resolveDecisionState(
  input: {
    status: DecisionStatus;
    decidedAt: Date | null | undefined;
    supersededById: string | null | undefined;
  },
  now: Date,
): { decidedAt: Date | null; supersededById: string | null } {
  const today = utcDay(now);
  if (input.status === "proposed") return { decidedAt: null, supersededById: null };
  const decidedAt = input.decidedAt ?? today;
  if (decidedAt.getTime() > today.getTime()) {
    throw new AppError("VALIDATION_FAILED", {
      details: [{ path: "decidedAt", message: "A decision date cannot be in the future" }],
    });
  }
  if (input.status === "superseded") {
    if (!input.supersededById) {
      throw new AppError("VALIDATION_FAILED", {
        details: [
          {
            path: "supersededById",
            message: "Choose the decision that supersedes this one",
          },
        ],
      });
    }
    return { decidedAt, supersededById: input.supersededById };
  }
  return { decidedAt, supersededById: null };
}

export function decisionTransitionVerb(
  before: DecisionStatus,
  after: DecisionStatus,
): "accepted" | "rejected" | "deprecated" | "superseded" | "restored" | "updated" {
  if (before === after) return "updated";
  if (after === "accepted" && before === "proposed") return "accepted";
  if (after === "accepted") return "restored";
  if (after === "proposed") return "restored";
  return after;
}

/**
 * Would recording "decision X is superseded by Y" create a supersession cycle? Follows Y's own
 * superseded-by chain (each decision at most once).
 */
export function createsSupersessionCycle(
  supersededBy: ReadonlyMap<string, string | null>,
  decisionId: string,
  supersederId: string,
): boolean {
  if (decisionId === supersederId) return true;
  const seen = new Set<string>();
  let cursor: string | null | undefined = supersederId;
  while (cursor && !seen.has(cursor)) {
    if (cursor === decisionId) return true;
    seen.add(cursor);
    cursor = supersededBy.get(cursor) ?? null;
  }
  return false;
}

// ── Revisit / staleness (revisit-v1) ──────────────────────────────────────────

/** Accepted decision whose recorded revisit date is strictly before today (UTC). */
export function isRevisitDue(
  d: { status: DecisionStatus; revisitDate: Date | null },
  now: Date,
): boolean {
  return (
    d.status === "accepted" &&
    d.revisitDate !== null &&
    d.revisitDate.getTime() < utcDay(now).getTime()
  );
}

/**
 * 00 §4 "Stale critical decision": revisit due AND the decision governs at least one component the
 * owner marked critical. Both inputs are recorded facts; nothing is inferred from age.
 */
export function isStaleCritical(
  d: { status: DecisionStatus; revisitDate: Date | null },
  criticalComponents: number,
  now: Date,
): boolean {
  return isRevisitDue(d, now) && criticalComponents > 0;
}

export function revisitExplanation(
  d: { status: DecisionStatus; revisitDate: Date | null },
  criticalComponents: number,
  now: Date,
): string {
  if (d.status !== "accepted") return "Revisit dates apply to accepted decisions only.";
  if (!d.revisitDate) return "No revisit date is recorded.";
  const date = toDateOnly(d.revisitDate);
  if (!isRevisitDue(d, now)) return `Revisit planned for ${date}.`;
  return criticalComponents > 0
    ? `Revisit was due on ${date} and the decision governs ${criticalComponents} critical component${criticalComponents === 1 ? "" : "s"}.`
    : `Revisit was due on ${date}.`;
}

// ── Documentation gaps (documentation-gaps-v1) ────────────────────────────────

/** The parts 10 "Architecture" and 00 §5 expect a decision record to have. */
export const DOCUMENTATION_PARTS = [
  "context",
  "decision",
  "consequences",
  "alternatives",
  "projects",
  "evidence",
] as const;
export type DocumentationPart = (typeof DOCUMENTATION_PARTS)[number];

export const DOCUMENTATION_PART_LABEL: Record<DocumentationPart, string> = {
  context: "Context",
  decision: "Decision",
  consequences: "Consequences",
  alternatives: "Alternatives",
  projects: "Related project",
  evidence: "Evidence",
};

const filled = (v: string | null | undefined) => typeof v === "string" && v.trim().length > 0;

/**
 * Which expected parts are missing. A list, never a score; "proposed" decisions are drafts, so the
 * decision text and consequences are not yet expected from them.
 */
export function documentationGaps(d: {
  status: DecisionStatus;
  context: string | null;
  decision: string | null;
  consequences: string | null;
  alternatives: number;
  projects: number;
  evidence: number;
}): DocumentationPart[] {
  const draft = d.status === "proposed";
  const gaps: DocumentationPart[] = [];
  if (!filled(d.context)) gaps.push("context");
  if (!draft && !filled(d.decision)) gaps.push("decision");
  if (!draft && !filled(d.consequences)) gaps.push("consequences");
  if (d.alternatives === 0) gaps.push("alternatives");
  if (d.projects === 0) gaps.push("projects");
  if (d.evidence === 0) gaps.push("evidence");
  return gaps;
}
