import type { FieldDescriptor, FieldOption } from "@/components/forms/entity-form";
import {
  canBeParent,
  GOAL_STATUSES,
  GOAL_TYPE_LABEL,
  GOAL_TYPES,
  type AttainmentState,
  type RiskState,
} from "@/modules/goals/goal.rules";
import { goalConfidenceSchema } from "@/modules/goals/goal.schemas";

/** Goal option lists and form descriptors (Phase 5), derived from the domain enums. */
export const GOAL_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};
export const GOAL_STATUS_TONE = {
  draft: "neutral",
  active: "info",
  on_hold: "warning",
  completed: "success",
  cancelled: "neutral",
} as const;

export const GOAL_TYPE_OPTIONS: FieldOption[] = GOAL_TYPES.map((t) => ({
  value: t,
  label: GOAL_TYPE_LABEL[t],
}));
export const GOAL_STATUS_OPTIONS: FieldOption[] = GOAL_STATUSES.map((s) => ({
  value: s,
  label: GOAL_STATUS_LABEL[s]!,
}));
export const GOAL_CONFIDENCE_OPTIONS: FieldOption[] = goalConfidenceSchema.options.map((c) => ({
  value: c,
  label: c.charAt(0).toUpperCase() + c.slice(1),
}));

export const RISK_LABEL: Record<RiskState, string> = {
  at_risk: "At risk",
  on_track: "On track",
  not_assessable: "Not assessable",
  not_applicable: "Not applicable",
};
export const RISK_TONE = {
  at_risk: "danger",
  on_track: "success",
  not_assessable: "neutral",
  not_applicable: "neutral",
} as const;
export const RISK_OPTIONS: FieldOption[] = (
  ["at_risk", "on_track", "not_assessable", "not_applicable"] as const
).map((r) => ({ value: r, label: RISK_LABEL[r] }));

export const ATTAINMENT_LABEL: Record<AttainmentState, string> = {
  attained: "Attained",
  in_progress: "In progress",
  regressed: "Regressed",
  not_computable: "Not computable",
};
export const ATTAINMENT_TONE = {
  attained: "success",
  in_progress: "info",
  regressed: "danger",
  not_computable: "neutral",
} as const;
export const ATTAINMENT_OPTIONS: FieldOption[] = (
  ["attained", "in_progress", "regressed", "not_computable"] as const
).map((a) => ({ value: a, label: ATTAINMENT_LABEL[a] }));

/** Lifecycle action labels for goal-lifecycle-v1 transitions (ADR 0031). */
export const TRANSITION_LABEL: Record<string, string> = {
  active: "Activate",
  on_hold: "Put on hold",
  completed: "Mark completed",
  cancelled: "Cancel goal",
  draft: "Restore as draft",
};

const TARGET_FIELDS: readonly FieldDescriptor[] = [
  {
    name: "metric",
    label: "Metric",
    kind: "text",
    maxLength: 120,
    description: "What you measure, e.g. “p95 latency” or “published articles”.",
  },
  { name: "unit", label: "Unit", kind: "text", maxLength: 30, description: "e.g. ms, %, count." },
  {
    name: "baseline",
    label: "Baseline",
    kind: "number",
    description: "The value when you started. Needed, with a target, to compute attainment.",
  },
  {
    name: "target",
    label: "Target",
    kind: "number",
    description: "The value that means done. Lower-than-baseline targets are supported.",
  },
];

const COMMON_FIELDS = (types: readonly FieldOption[]): FieldDescriptor[] => [
  { name: "title", label: "Title", kind: "text", required: true, maxLength: 200, wide: true },
  {
    name: "type",
    label: "Level",
    kind: "select",
    options: types,
    defaultValue: types[0]?.value,
    description: "North Star → Annual objective → Quarterly goal.",
  },
  {
    name: "confidence",
    label: "Confidence (your own)",
    kind: "select",
    emptyOption: "Not set",
    options: GOAL_CONFIDENCE_OPTIONS,
    description: "Self-assessed. It is shown as entered and never used in any calculation.",
  },
  { name: "startDate", label: "Start date", kind: "date" },
  { name: "deadline", label: "Deadline", kind: "date" },
  ...TARGET_FIELDS,
  { name: "outcome", label: "Outcome", kind: "textarea", maxLength: 2_000 },
  { name: "description", label: "Description", kind: "textarea", maxLength: 4_000 },
];

/** Create: drafts by default; a goal may also start active. */
export function goalCreateFields(
  types: readonly FieldOption[] = GOAL_TYPE_OPTIONS,
): FieldDescriptor[] {
  const fields = COMMON_FIELDS(types);
  fields.splice(2, 0, {
    name: "status",
    label: "Status",
    kind: "select",
    options: GOAL_STATUS_OPTIONS.filter((o) => o.value === "draft" || o.value === "active"),
    defaultValue: "draft",
    description: "Later changes use the lifecycle actions on the goal.",
  });
  return fields;
}

/** Edit: lifecycle (status, completion date) changes through the explicit transition actions. */
export const GOAL_EDIT_FIELDS: readonly FieldDescriptor[] = COMMON_FIELDS(GOAL_TYPE_OPTIONS);

/** Levels allowed for a child of a goal of this type (strictly lower level). */
export function childTypeOptions(parentType: string): FieldOption[] {
  return GOAL_TYPE_OPTIONS.filter((o) => canBeParent(parentType as never, o.value as never));
}

export const MEASUREMENT_FIELDS: readonly FieldDescriptor[] = [
  { name: "date", label: "Date", kind: "date", required: true },
  { name: "value", label: "Value", kind: "number", required: true },
  { name: "note", label: "Note", kind: "text", maxLength: 300, wide: true },
];
