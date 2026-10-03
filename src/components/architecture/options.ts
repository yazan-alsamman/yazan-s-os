import type { FieldDescriptor, FieldOption } from "@/components/forms/entity-form";
import {
  COMPONENT_TYPE_LABEL,
  COMPONENT_TYPES,
  DECISION_STATUS_LABEL,
  DECISION_STATUSES,
  DOCUMENTATION_PART_LABEL,
} from "@/modules/architecture/architecture.rules";

export const STATUS_TONE = {
  proposed: "info",
  accepted: "success",
  rejected: "neutral",
  deprecated: "warning",
  superseded: "neutral",
} as const;

export const STATUS_OPTIONS: FieldOption[] = DECISION_STATUSES.map((s) => ({
  value: s,
  label: DECISION_STATUS_LABEL[s],
}));
export const TYPE_OPTIONS: FieldOption[] = COMPONENT_TYPES.map((t) => ({
  value: t,
  label: COMPONENT_TYPE_LABEL[t],
}));
export { COMPONENT_TYPE_LABEL, DECISION_STATUS_LABEL, DOCUMENTATION_PART_LABEL };

/** Lifecycle action labels (decision-lifecycle-v1, ADR 0042). */
export const TRANSITION_LABEL: Record<string, string> = {
  accepted: "Accept",
  rejected: "Reject",
  deprecated: "Deprecate",
  superseded: "Supersede…",
  proposed: "Reconsider",
};

const RECORD_FIELDS: FieldDescriptor[] = [
  { name: "title", label: "Title", kind: "text", required: true, maxLength: 200, wide: true },
  {
    name: "context",
    label: "Context",
    kind: "textarea",
    maxLength: 10_000,
    description: "The situation and forces at play.",
  },
  { name: "problem", label: "Problem", kind: "textarea", maxLength: 10_000 },
  { name: "constraints", label: "Constraints", kind: "textarea", maxLength: 10_000 },
  { name: "decision", label: "Decision", kind: "textarea", maxLength: 10_000 },
  { name: "consequences", label: "Consequences", kind: "textarea", maxLength: 10_000 },
  {
    name: "revisitDate",
    label: "Revisit date",
    kind: "date",
    description: "When the decision should be reviewed. Accepted decisions past it are “due”.",
  },
];

/** Create: a proposal, or an already-made decision (with its date). */
export const DECISION_CREATE_FIELDS: readonly FieldDescriptor[] = [
  RECORD_FIELDS[0]!,
  {
    name: "status",
    label: "Status",
    kind: "select",
    options: STATUS_OPTIONS.filter((o) => ["proposed", "accepted", "rejected"].includes(o.value)),
    defaultValue: "proposed",
    description: "Later changes (deprecate, supersede) use the lifecycle actions.",
  },
  {
    name: "decidedAt",
    label: "Decision date",
    kind: "date",
    description: "For accepted or rejected decisions. Left empty = today. Not used for proposals.",
  },
  ...RECORD_FIELDS.slice(1),
];

/** Edit: the record; status and supersession use the lifecycle actions. */
export const DECISION_EDIT_FIELDS: readonly FieldDescriptor[] = [
  ...RECORD_FIELDS,
  {
    name: "decidedAt",
    label: "Decision date",
    kind: "date",
    description: "Recorded date of the decision (proposals have none).",
  },
];

export const ALTERNATIVE_FIELDS: readonly FieldDescriptor[] = [
  { name: "name", label: "Option", kind: "text", required: true, maxLength: 200, wide: true },
  { name: "pros", label: "Pros", kind: "textarea", maxLength: 4_000 },
  { name: "cons", label: "Cons", kind: "textarea", maxLength: 4_000 },
  { name: "rejectedReason", label: "Why not chosen", kind: "textarea", maxLength: 4_000 },
];

export const COMPONENT_FIELDS: readonly FieldDescriptor[] = [
  { name: "name", label: "Name", kind: "text", required: true, maxLength: 120 },
  { name: "type", label: "Type", kind: "select", options: TYPE_OPTIONS, defaultValue: "service" },
  { name: "purpose", label: "Purpose", kind: "textarea", maxLength: 2_000, wide: true },
  {
    name: "critical",
    label: "Critical component — I mark this as critical to the system",
    kind: "checkbox",
    defaultValue: false,
    wide: true,
  },
];
