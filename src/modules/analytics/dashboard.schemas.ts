import { z } from "zod";

import { RecordOrigin } from "@/generated/prisma/enums";
import { booleanQuerySchema, paginationQuerySchema } from "@/lib/http/pagination";
import { evidenceTypeSchema } from "@/modules/evidence/evidence.schemas";
import { projectHealthSchema, projectStatusSchema } from "@/modules/projects/project.schemas";
import { isoDate } from "@/modules/shared/fields";

/**
 * Command Center filters (ADR 0020). All are optional, URL-serialisable and validated; none is an
 * identifier, so a filter can only narrow the caller's own data — never reach another user's.
 */
export const RANGE_PRESETS = ["30d", "90d", "365d", "all", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const dashboardFiltersSchema = z
  .object({
    range: z.enum(RANGE_PRESETS).default("90d"),
    from: isoDate.optional(),
    to: isoDate.optional(),
    projectStatus: projectStatusSchema.optional(),
    projectHealth: projectHealthSchema.optional(),
    evidenceType: evidenceTypeSchema.optional(),
    evidenceVerified: booleanQuerySchema,
    evidenceOrigin: z.enum(RecordOrigin).optional(),
    skillCategory: z.string().trim().min(1).max(80).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.range !== "custom") return;
    if (!value.from || !value.to) {
      ctx.addIssue({
        code: "custom",
        path: ["from"],
        message: "A custom range needs both from and to",
      });
      return;
    }
    if (value.to.getTime() < value.from.getTime()) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "The end date must not be before the start date",
      });
    }
    const days = (value.to.getTime() - value.from.getTime()) / 86_400_000 + 1;
    if (days > 366 * 20) {
      ctx.addIssue({
        code: "custom",
        path: ["from"],
        message: "A custom range may span at most 20 years",
      });
    }
  });

export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;

export const activityQuerySchema = paginationQuerySchema.extend({
  range: z.enum(RANGE_PRESETS).default("90d"),
  from: isoDate.optional(),
  to: isoDate.optional(),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const timelineQuerySchema = paginationQuerySchema.extend({
  range: z.enum(RANGE_PRESETS).default("90d"),
  from: isoDate.optional(),
  to: isoDate.optional(),
  evidenceType: evidenceTypeSchema.optional(),
  evidenceVerified: booleanQuerySchema,
  evidenceOrigin: z.enum(RecordOrigin).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
