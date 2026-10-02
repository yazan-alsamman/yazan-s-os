/**
 * Skill level models (ADR 0013). 01_FEATURE_CATALOG.md §6 defines the default scale and requires
 * levels to be customisable. Phase 1 ships the specification default; user-defined models
 * (Phase 4, "skill levels") register additional ids without changing the Skill table.
 */
export interface SkillLevel {
  value: number;
  label: string;
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
    { value: 0, label: "Not evaluated" },
    { value: 1, label: "Awareness" },
    { value: 2, label: "Working knowledge" },
    { value: 3, label: "Independent" },
    { value: 4, label: "Advanced" },
    { value: 5, label: "Expert / can lead" },
  ],
};

const MODELS = new Map<string, SkillLevelModel>([[DEFAULT_LEVEL_MODEL_ID, DEFAULT_LEVEL_MODEL]]);

export function getLevelModel(id: string): SkillLevelModel | undefined {
  return MODELS.get(id);
}

export function listLevelModels(): SkillLevelModel[] {
  return [...MODELS.values()];
}

export function isValidLevel(modelId: string, level: number): boolean {
  return Boolean(getLevelModel(modelId)?.levels.some((l) => l.value === level));
}

export function levelLabel(modelId: string, level: number | null): string | null {
  if (level === null) return null;
  return getLevelModel(modelId)?.levels.find((l) => l.value === level)?.label ?? String(level);
}
