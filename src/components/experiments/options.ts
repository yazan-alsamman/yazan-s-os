import type { FieldDescriptor, FieldOption } from "@/components/forms/entity-form";
import {
  DECISION_LABEL,
  EXPERIMENT_DECISIONS,
  EXPERIMENT_STATUS_LABEL,
  EXPERIMENT_STATUSES,
  REPRODUCIBILITY_LABEL,
  RUN_STATUS_LABEL,
  RUN_STATUSES,
  type ReproducibilityState,
} from "@/modules/experiments/experiment.rules";

export const STATUS_TONE = {
  planned: "neutral",
  active: "info",
  completed: "success",
  abandoned: "neutral",
} as const;
export const DECISION_TONE = {
  adopt: "success",
  reject: "danger",
  inconclusive: "warning",
} as const;
export const RUN_STATUS_TONE = {
  completed: "success",
  failed: "danger",
  aborted: "neutral",
} as const;
export const REPRO_TONE: Record<
  ReproducibilityState,
  "success" | "warning" | "danger" | "neutral"
> = {
  reproducible: "success",
  partial: "warning",
  not_reproducible: "danger",
  unknown: "neutral",
};

export const STATUS_OPTIONS: FieldOption[] = EXPERIMENT_STATUSES.map((s) => ({
  value: s,
  label: EXPERIMENT_STATUS_LABEL[s],
}));
export const DECISION_OPTIONS: FieldOption[] = EXPERIMENT_DECISIONS.map((d) => ({
  value: d,
  label: DECISION_LABEL[d],
}));
export const RUN_STATUS_OPTIONS: FieldOption[] = RUN_STATUSES.map((s) => ({
  value: s,
  label: RUN_STATUS_LABEL[s],
}));
export const REPRO_OPTIONS: FieldOption[] = (
  ["reproducible", "partial", "not_reproducible", "unknown"] as const
).map((r) => ({ value: r, label: REPRODUCIBILITY_LABEL[r] }));

/** Lifecycle action labels for the dossier buttons (ADR 0037). */
export const TRANSITION_LABEL: Record<string, string> = {
  planned: "Back to planned",
  active: "Activate",
  completed: "Mark completed",
  abandoned: "Abandon",
};

/** Create: planned or active only; lifecycle afterwards uses the dossier actions. */
export const EXPERIMENT_CREATE_FIELDS: readonly FieldDescriptor[] = [
  { name: "title", label: "Title", kind: "text", required: true, maxLength: 200, wide: true },
  {
    name: "status",
    label: "Status",
    kind: "select",
    options: STATUS_OPTIONS.filter((o) => o.value === "planned" || o.value === "active"),
    defaultValue: "planned",
    description: "Later changes use the lifecycle actions on the experiment.",
  },
  {
    name: "category",
    label: "Category",
    kind: "text",
    maxLength: 80,
    description: "Free text, e.g. RAG, fine-tuning, prompt eval.",
  },
  { name: "objective", label: "Objective", kind: "textarea", maxLength: 2_000 },
  {
    name: "hypothesis",
    label: "Hypothesis",
    kind: "textarea",
    maxLength: 4_000,
    description: "What you expected to happen, and why.",
  },
];

/** Edit: adds the owner's conclusion fields. Status/completion stay with the lifecycle actions. */
export const EXPERIMENT_EDIT_FIELDS: readonly FieldDescriptor[] = [
  { name: "title", label: "Title", kind: "text", required: true, maxLength: 200, wide: true },
  { name: "category", label: "Category", kind: "text", maxLength: 80 },
  { name: "objective", label: "Objective", kind: "textarea", maxLength: 2_000 },
  { name: "hypothesis", label: "Hypothesis", kind: "textarea", maxLength: 4_000 },
  {
    name: "decision",
    label: "Decision (your conclusion)",
    kind: "select",
    emptyOption: "Undecided",
    options: DECISION_OPTIONS,
    description:
      "Your interpretation. Separate from status — completed is not the same as adopted.",
  },
  { name: "result", label: "Result / conclusion", kind: "textarea", maxLength: 4_000 },
  {
    name: "reproducibilityNote",
    label: "Reproducibility notes",
    kind: "textarea",
    maxLength: 2_000,
  },
  { name: "startedAt", label: "Started", kind: "date" },
];

export const RUN_FIELDS: readonly FieldDescriptor[] = [
  { name: "label", label: "Label", kind: "text", maxLength: 120, wide: true },
  {
    name: "status",
    label: "Execution status",
    kind: "select",
    options: RUN_STATUS_OPTIONS,
    defaultValue: "completed",
  },
  { name: "runAt", label: "Run date", kind: "date" },
  { name: "model", label: "Model", kind: "text", maxLength: 120 },
  { name: "modelVersion", label: "Model version", kind: "text", maxLength: 120 },
  { name: "provider", label: "Provider", kind: "text", maxLength: 120 },
  { name: "promptVersion", label: "Prompt version", kind: "text", maxLength: 120 },
  { name: "datasetName", label: "Dataset", kind: "text", maxLength: 200 },
  { name: "datasetVersion", label: "Dataset version", kind: "text", maxLength: 120 },
  {
    name: "codeRef",
    label: "Code ref",
    kind: "text",
    maxLength: 200,
    description: "Commit, tag or URL.",
  },
  { name: "environment", label: "Environment", kind: "text", maxLength: 200 },
  {
    name: "costUsd",
    label: "Cost (USD)",
    kind: "number",
    description: "Recorded, if measured. Left empty = not recorded (not zero).",
  },
  { name: "latencyMs", label: "Latency (ms)", kind: "number" },
  { name: "tokensInput", label: "Tokens in", kind: "number" },
  { name: "tokensOutput", label: "Tokens out", kind: "number" },
  { name: "notes", label: "Notes", kind: "textarea", maxLength: 4_000 },
];

/** Direction for an evaluation metric (maps to higherIsBetter: true | false | null). */
export const DIRECTION_OPTIONS: FieldOption[] = [
  { value: "higher", label: "Higher is better" },
  { value: "lower", label: "Lower is better" },
];

export const METRIC_FIELDS: readonly FieldDescriptor[] = [
  {
    name: "name",
    label: "Criterion",
    kind: "text",
    required: true,
    maxLength: 80,
    description: "e.g. accuracy, groundedness, human rating.",
  },
  { name: "value", label: "Value", kind: "number", required: true },
  { name: "unit", label: "Unit", kind: "text", maxLength: 40, description: "e.g. %, F1, 1–5." },
  {
    name: "direction",
    label: "Direction",
    kind: "select",
    emptyOption: "No direction (informational)",
    options: DIRECTION_OPTIONS,
  },
  { name: "note", label: "Note", kind: "text", maxLength: 300, wide: true },
];

/** Form payload → API payload for a metric (direction → higherIsBetter tri-state). */
export function metricPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const direction = payload.direction;
  const higherIsBetter = direction === "higher" ? true : direction === "lower" ? false : null;
  const { direction: _drop, ...rest } = payload;
  void _drop;
  return { ...rest, higherIsBetter };
}
