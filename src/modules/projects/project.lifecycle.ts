import type { ProjectStatus } from "@/generated/prisma/enums";

/**
 * Lifecycle groupings of the `01` §3 project lifecycle (ADR 0018). Single source of truth for the
 * Command Center metrics AND the project list's `lifecycle` drill-down filter, so a KPI value and
 * the list it links to always agree.
 *
 *   idea → [discovery → architecture → development → validation] → [production → maintenance] → archived
 *           └──────────────────── active ───────────────────────┘   └──── production ────┘
 */
export const ACTIVE_STATUSES = [
  "discovery",
  "architecture",
  "development",
  "validation",
] as const satisfies readonly ProjectStatus[];

export const PRODUCTION_STATUSES = [
  "production",
  "maintenance",
] as const satisfies readonly ProjectStatus[];

export const LIFECYCLE_GROUPS = {
  active: ACTIVE_STATUSES,
  production: PRODUCTION_STATUSES,
} as const;

export type LifecycleGroup = keyof typeof LIFECYCLE_GROUPS;

/** The canonical `01` §3 lifecycle, in order (used for stage position and stable chart order). */
export const LIFECYCLE_ORDER = [
  "idea",
  "discovery",
  "architecture",
  "development",
  "validation",
  "production",
  "maintenance",
  "archived",
] as const satisfies readonly ProjectStatus[];
