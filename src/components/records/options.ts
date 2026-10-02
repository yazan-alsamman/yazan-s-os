import { humanize } from "@/components/data/detail";
import type { FieldOption } from "@/components/forms/entity-form";
import { certificationStatusSchema } from "@/modules/certifications/certification.schemas";
import { evidenceTypeSchema } from "@/modules/evidence/evidence.schemas";
import {
  projectHealthSchema,
  projectStatusSchema,
  technologyUsageTypeSchema,
} from "@/modules/projects/project.schemas";
import { DEFAULT_LEVEL_MODEL } from "@/modules/skills/level-models";
import { evidenceStrengthSchema } from "@/modules/skills/skill.schemas";

/** Select options derived from the domain enums (single source of truth). */
function fromValues(values: readonly string[], labels: Record<string, string> = {}): FieldOption[] {
  return values.map((value) => ({ value, label: labels[value] ?? humanize(value) }));
}

export const PROJECT_STATUS_OPTIONS = fromValues(projectStatusSchema.options);
export const PROJECT_HEALTH_OPTIONS = fromValues(projectHealthSchema.options, {
  not_assessed: "Not assessed",
  on_track: "On track",
  at_risk: "At risk",
});
export const USAGE_TYPE_OPTIONS = fromValues(technologyUsageTypeSchema.options);
export const CERTIFICATION_STATUS_OPTIONS = fromValues(certificationStatusSchema.options);
export const EVIDENCE_TYPE_OPTIONS = fromValues(evidenceTypeSchema.options);
export const EVIDENCE_STRENGTH_OPTIONS = fromValues(evidenceStrengthSchema.options);
export const EXPIRY_OPTIONS: FieldOption[] = [
  { value: "valid", label: "Valid" },
  { value: "expiring", label: "Expiring (90 days)" },
  { value: "expired", label: "Expired" },
  { value: "no_expiry", label: "No expiry" },
];
export const YES_NO_OPTIONS: FieldOption[] = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];
export const ORIGIN_OPTIONS: FieldOption[] = [
  { value: "manual", label: "Entered manually" },
  { value: "import", label: "Imported" },
];
export const LEVEL_OPTIONS: FieldOption[] = DEFAULT_LEVEL_MODEL.levels.map((l) => ({
  value: String(l.value),
  label: `${l.value} — ${l.label}`,
}));

export function labelOf(options: readonly FieldOption[], value: string | null | undefined) {
  return options.find((o) => o.value === value)?.label ?? humanize(value);
}
