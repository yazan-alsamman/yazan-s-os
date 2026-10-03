/**
 * Skill level models (ADR 0013). 01_FEATURE_CATALOG.md §6 defines the default scale and requires
 * levels to be customisable. Phase 1 ships the specification default; user-defined models
 * (Phase 4, "skill levels") register additional ids without changing the Skill table.
 */
export interface SkillLevel {
  value: number;
  label: string;
  /** What this level means; for the default model, the evidence rule that derives it. */
  description?: string;
}

export interface SkillLevelModel {
  id: string;
  name: string;
  levels: readonly SkillLevel[];
}

export const DEFAULT_LEVEL_MODEL_ID = "peos-default-v1";

export const DEFAULT_LEVEL_MODEL: SkillLevelModel = {
  id: DEFAULT_LEVEL_MODEL_ID,
  name: "PEOS default (0–5)",
  levels: [
    { value: 0, label: "Not evaluated", description: "No level is derived — never a finding." },
    {
      value: 1,
      label: "Awareness",
      description: "Any linked evidence, project, or earned/in-progress certification.",
    },
    {
      value: 2,
      label: "Working knowledge",
      description:
        "Moderate/strong evidence, a linked project in delivery, or an earned certification.",
    },
    {
      value: 3,
      label: "Independent",
      description: "2+ moderate/strong evidence (1+ verified) and a linked project in delivery.",
    },
    {
      value: 4,
      label: "Advanced",
      description:
        "3+ moderate/strong evidence (2+ verified, 1+ strong) and a production-linked record.",
    },
    {
      value: 5,
      label: "Expert / can lead",
      description:
        "5+ moderate/strong evidence (3+ verified, 2+ strong verified), 2+ production-linked records and a verified testimonial or publication.",
    },
  ],
};

/** Every level model uses the canonical ordered values 0–5 (ADR 0026). */
export const CANONICAL_LEVEL_VALUES = [0, 1, 2, 3, 4, 5] as const;
export const MAX_LEVEL = 5;

/** Marker stored in Skill.levelModel when a user's custom model (Skill.levelModelId) applies. */
export const CUSTOM_LEVEL_MODEL_ID = "custom";

const MODELS = new Map<string, SkillLevelModel>([[DEFAULT_LEVEL_MODEL_ID, DEFAULT_LEVEL_MODEL]]);

export function getLevelModel(id: string): SkillLevelModel | undefined {
  return MODELS.get(id);
}

export function listLevelModels(): SkillLevelModel[] {
  return [...MODELS.values()];
}

export function isValidLevel(modelId: string, level: number): boolean {
  if (modelId === CUSTOM_LEVEL_MODEL_ID) {
    return (CANONICAL_LEVEL_VALUES as readonly number[]).includes(level);
  }
  return Boolean(getLevelModel(modelId)?.levels.some((l) => l.value === level));
}

export function levelLabel(modelId: string, level: number | null): string | null {
  if (level === null) return null;
  return getLevelModel(modelId)?.levels.find((l) => l.value === level)?.label ?? String(level);
}
