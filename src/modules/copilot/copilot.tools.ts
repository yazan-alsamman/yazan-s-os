import { z } from "zod";

import { metricHref } from "@/components/command-center/drilldown";
import type { PrismaClient } from "@/generated/prisma/client";
import { parseInput } from "@/lib/validation/parse";
import { dashboardFiltersSchema } from "@/modules/analytics/dashboard.schemas";
import { createDashboardService } from "@/modules/analytics/dashboard.service";
import { getMetric } from "@/modules/analytics/metric-catalogue";
import type { MetricResult } from "@/modules/analytics/metric-result";
import {
  createPortfolioService,
  portfolioFiltersSchema,
} from "@/modules/analytics/portfolio.service";
import { createArchitectureIntelligenceService } from "@/modules/architecture/architecture-intelligence";
import { listDecisionsQuerySchema } from "@/modules/architecture/architecture.schemas";
import { listCertificationsQuerySchema } from "@/modules/certifications/certification.schemas";
import { createCertificationService } from "@/modules/certifications/certification.service";
import { listEvidenceQuerySchema } from "@/modules/evidence/evidence.schemas";
import { createEvidenceService } from "@/modules/evidence/evidence.service";
import { createExperimentIntelligenceService } from "@/modules/experiments/experiment-intelligence";
import { listExperimentsQuerySchema } from "@/modules/experiments/experiment.schemas";
import { createGoalIntelligenceService } from "@/modules/goals/goal-intelligence";
import { listGoalsQuerySchema } from "@/modules/goals/goal.schemas";
import { createProjectIntelligenceService } from "@/modules/projects/project-intelligence";
import { listProjectsQuerySchema } from "@/modules/projects/project.schemas";
import { createProjectService } from "@/modules/projects/project.service";
import { uuidSchema } from "@/modules/shared/fields";
import type { ServiceContext } from "@/modules/shared/service-context";
import {
  createSkillIntelligenceService,
  skillIntelligenceQuerySchema,
} from "@/modules/skills/skill-intelligence.service";
import { listTechnologiesQuerySchema } from "@/modules/technologies/technology.schemas";
import { createTechnologyService } from "@/modules/technologies/technology.service";

/**
 * Copilot tool layer (06 "Tool Layer"; ADR 0046). Exactly the twelve tools named in 06. Each tool:
 * - has a strict input schema (unknown keys rejected — no userId/ownerId can be passed);
 * - runs as the session user (ctx), via the authoritative domain service — never raw SQL;
 * - returns bounded results (≤ MAX_ITEMS) with an explicit limitation when more exist;
 * - returns provenance (`sources`) from which citations are built — citations never come from
 *   anything else.
 * Tools are selected and executed by server code (the intent router), never by the model.
 */
export const MAX_ITEMS = 10;
const MAX_TEXT = 300;

export type SourceType =
  | "project"
  | "skill"
  | "evidence"
  | "goal"
  | "experiment"
  | "certification"
  | "technology"
  | "decision"
  | "metric";

export type FieldValue = string | number | boolean | null;

/** A retrieved record or authoritative metric — the only things a citation may point to. */
export interface Source {
  ref: string;
  type: SourceType;
  id: string;
  label: string;
  href: string | null;
  /** "record" = persisted PEOS record; "derived" = authoritative analytics/intelligence value. */
  origin: "record" | "derived";
  fields: Record<string, FieldValue>;
}

export interface ToolResult {
  sources: Source[];
  total: number | null;
  /** Explicit limitation instead of silent truncation. */
  limitation: string | null;
}

const text = (v: unknown): FieldValue => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "boolean") return v;
  const s = String(v);
  return s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}…` : s;
};
const fieldsOf = (o: Record<string, unknown>): Record<string, FieldValue> =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, text(v)]));

const record = (
  type: SourceType,
  id: string,
  label: string,
  href: string | null,
  fields: Record<string, unknown>,
): Source => ({
  ref: `${type}:${id}`,
  type,
  id,
  label,
  href,
  origin: "record",
  fields: fieldsOf(fields),
});

function limitation(total: number, shown: number, noun: string) {
  return total > shown
    ? `Showing ${shown} of ${total} ${noun}; refine the question or filters to see others.`
    : null;
}

/** Authoritative MetricResult values found in a service response (never recomputed here). */
export function metricSources(value: unknown, depth = 0, out: Source[] = []): Source[] {
  if (!value || typeof value !== "object" || depth > 3) return out;
  const v = value as Partial<MetricResult> & Record<string, unknown>;
  if (
    typeof v.key === "string" &&
    typeof v.state === "string" &&
    "value" in v &&
    Array.isArray(v.source)
  ) {
    const def = getMetric(v.key);
    const period = v.period ? { from: v.period.from, to: v.period.to } : { from: null, to: null };
    out.push({
      ref: `metric:${v.key}`,
      type: "metric",
      id: v.key,
      label: def.name,
      href: metricHref(v.key, {}, period),
      origin: "derived",
      fields: fieldsOf({
        value: v.value,
        state: v.state,
        reason: v.stateReason ?? null,
        period: v.period?.label ?? null,
        definition: def.definition,
        formula: def.formula,
        breakdown: v.breakdown ? v.breakdown.map((b) => `${b.label}: ${b.value}`).join("; ") : null,
      }),
    });
    return out;
  }
  if (Array.isArray(value)) return out;
  for (const child of Object.values(v)) metricSources(child, depth + 1, out);
  return out;
}

const term = z.string().trim().min(1).max(100).optional();
const range = z.enum(["30d", "90d", "365d", "all"]).default("365d");

interface ToolDefinition<TSchema extends z.ZodType> {
  name: string;
  description: string;
  input: TSchema;
  run: (db: PrismaClient, ctx: ServiceContext, input: z.output<TSchema>) => Promise<ToolResult>;
}

const define = <TSchema extends z.ZodType>(t: ToolDefinition<TSchema>) => t;

export const TOOLS = {
  searchProjects: define({
    name: "searchProjects",
    description:
      "Projects matching text, lifecycle status or manual health (most recently updated first).",
    input: z
      .object({
        q: term,
        status: listProjectsQuerySchema.shape.status,
        healthStatus: listProjectsQuerySchema.shape.healthStatus,
      })
      .strict(),
    async run(db, ctx, input) {
      const r = await createProjectService(db).list(
        ctx,
        parseInput(listProjectsQuerySchema, { ...input, pageSize: String(MAX_ITEMS) }),
      );
      return {
        sources: r.data.map((p) =>
          record("project", p.id, p.name, `/projects/${p.id}`, {
            status: p.status,
            manualHealth: p.healthStatus,
            startDate: p.startDate,
            targetDate: p.targetDate,
            completedAt: p.completedAt,
            skills: p.counts.skills,
            technologies: p.counts.technologies,
            evidence: p.counts.evidence,
          }),
        ),
        total: r.page.total,
        limitation: limitation(r.page.total, r.data.length, "projects"),
      };
    },
  }),

  getProject: define({
    name: "getProject",
    description:
      "One project with its description, technologies, skills, computed health and delivery metrics.",
    input: z.object({ id: uuidSchema }).strict(),
    async run(db, ctx, input) {
      const [p, intel] = await Promise.all([
        createProjectService(db).get(ctx, input.id),
        createProjectIntelligenceService(db).get(ctx, input.id),
      ]);
      const health = intel.health.computed;
      return {
        sources: [
          record("project", p.id, p.name, `/projects/${p.id}`, {
            status: p.status,
            manualHealth: p.healthStatus,
            description: p.description,
            problem: p.problem,
            solution: p.solution,
            impact: p.impact,
            startDate: p.startDate,
            targetDate: p.targetDate,
            completedAt: p.completedAt,
            computedHealthScore: health.score,
            computedHealthBand: health.band,
            computedHealthExplanation: health.explanation,
            technologies: p.technologies.map((t) => t.name).join(", ") || null,
            skills: p.skills.map((s) => s.name).join(", ") || null,
            evidenceItems: p.evidence.length,
          }),
          ...p.evidence.slice(0, MAX_ITEMS).map((e) =>
            record("evidence", e.id, e.title, `/evidence/${e.id}`, {
              type: e.type,
              date: e.date,
              verified: e.verified,
              linkedTo: p.name,
            }),
          ),
          ...metricSources(intel.milestones),
        ],
        total: 1,
        limitation: limitation(
          p.evidence.length,
          Math.min(p.evidence.length, MAX_ITEMS),
          "evidence items",
        ),
      };
    },
  }),

  searchSkills: define({
    name: "searchSkills",
    description:
      "Active skills with evidence-derived level, target, gap and freshness (largest gaps first).",
    input: z
      .object({
        category: term,
        critical: z.boolean().optional(),
        gap: skillIntelligenceQuerySchema.shape.gap,
        freshness: skillIntelligenceQuerySchema.shape.freshness,
      })
      .strict(),
    async run(db, ctx, input) {
      const r = await createSkillIntelligenceService(db).list(
        ctx,
        parseInput(skillIntelligenceQuerySchema, {
          category: input.category,
          gap: input.gap,
          freshness: input.freshness,
          critical: input.critical === undefined ? undefined : String(input.critical),
          active: "true",
          pageSize: String(MAX_ITEMS),
        }),
      );
      return {
        sources: r.data.map((s) =>
          record("skill", s.id, s.name, `/skills/${s.id}`, {
            category: s.category,
            derivedLevel: s.current.level,
            derivedLevelLabel: s.current.label,
            targetLevel: s.target.level,
            gap: s.gap.state,
            gapLevels: s.gap.value,
            criticalGap: s.gap.critical,
            freshness: s.freshness.state,
            lastDemonstrated: s.freshness.latest,
            evidence: s.counts.evidence,
            projects: s.counts.projects,
          }),
        ),
        total: r.page.total,
        limitation: limitation(r.page.total, r.data.length, "skills"),
      };
    },
  }),

  getSkill: define({
    name: "getSkill",
    description:
      "One skill's evidence-derived level with its explanation, gap, freshness and trend.",
    input: z.object({ id: uuidSchema }).strict(),
    async run(db, ctx, input) {
      const d = await createSkillIntelligenceService(db).get(ctx, input.id);
      return {
        sources: [
          {
            ...record("skill", d.row.id, d.row.name, `/skills/${d.row.id}`, {
              derivedLevel: d.row.current.level,
              derivedLevelLabel: d.row.current.label,
              targetLevel: d.row.target.level,
              levelExplanation: d.derived.explanation,
              gapExplanation: d.gap.explanation,
              freshnessExplanation: d.freshness.explanation,
              trendExplanation: d.trend.explanation,
              evidence: d.evidence.total,
              projects: d.projects.length,
              certifications: d.certifications.length,
            }),
          },
        ],
        total: 1,
        limitation: null,
      };
    },
  }),

  searchEvidence: define({
    name: "searchEvidence",
    description:
      "Evidence records by text, type, verification, date range, project or skill (newest first).",
    input: z
      .object({
        q: term,
        type: listEvidenceQuerySchema.shape.type,
        verified: z.boolean().optional(),
        projectId: uuidSchema.optional(),
        skillId: uuidSchema.optional(),
        dateFrom: z.iso.date().optional(),
        dateTo: z.iso.date().optional(),
      })
      .strict()
      .refine(
        (v) => !v.dateFrom || !v.dateTo || v.dateFrom <= v.dateTo,
        "dateTo must not be before dateFrom",
      ),
    async run(db, ctx, input) {
      const r = await createEvidenceService(db).list(
        ctx,
        parseInput(listEvidenceQuerySchema, {
          ...input,
          verified: input.verified === undefined ? undefined : String(input.verified),
          pageSize: String(MAX_ITEMS),
        }),
      );
      return {
        sources: r.data.map((e) =>
          record("evidence", e.id, e.title, `/evidence/${e.id}`, {
            type: e.type,
            date: e.date,
            verified: e.verified,
            description: e.description,
            projects: e.counts.projects,
            skills: e.counts.skills,
          }),
        ),
        total: r.page.total,
        limitation: limitation(r.page.total, r.data.length, "evidence items"),
      };
    },
  }),

  getCareerMetrics: define({
    name: "getCareerMetrics",
    description:
      "Career metrics from the Command Center analytics (skills, evidence, certifications) for a range.",
    input: z.object({ range }).strict(),
    async run(db, ctx, input) {
      const d = await createDashboardService(db).dashboard(
        ctx,
        parseInput(dashboardFiltersSchema, { range: input.range }),
      );
      const sources = metricSources({
        evidence: d.evidence,
        skills: d.skills,
        certifications: d.certifications,
      });
      return { sources, total: sources.length, limitation: null };
    },
  }),

  getProjectMetrics: define({
    name: "getProjectMetrics",
    description: "Project portfolio metrics (lifecycle, health, delivery, milestones) for a range.",
    input: z.object({ range }).strict(),
    async run(db, ctx, input) {
      const p = await createPortfolioService(db).portfolio(
        ctx,
        parseInput(portfolioFiltersSchema, { range: input.range }),
      );
      const sources = metricSources(p);
      return { sources, total: sources.length, limitation: null };
    },
  }),

  getAIExperiments: define({
    name: "getAIExperiments",
    description:
      "AI Lab experiments with status, decision, runs, evaluation coverage and reproducibility.",
    input: z
      .object({
        q: term,
        status: listExperimentsQuerySchema.shape.status,
        decision: listExperimentsQuerySchema.shape.decision,
      })
      .strict(),
    async run(db, ctx, input) {
      const r = await createExperimentIntelligenceService(db).list(
        ctx,
        parseInput(listExperimentsQuerySchema, { ...input, pageSize: String(MAX_ITEMS) }),
      );
      return {
        sources: r.data.map((e) =>
          record("experiment", e.id, e.title, `/ai-lab/${e.id}`, {
            status: e.status,
            decision: e.decision,
            category: e.category,
            hypothesis: e.hypothesis,
            result: e.result,
            runs: e.runs.total,
            evaluatedRuns: e.evaluation.runsWithMetrics,
            reproducibility: e.reproducibility,
            latestModel: e.latest?.model ?? null,
            latestCostUsd: e.latest?.costUsd ?? null,
            latestLatencyMs: e.latest?.latencyMs ?? null,
          }),
        ),
        total: r.page.total,
        limitation: limitation(r.page.total, r.data.length, "experiments"),
      };
    },
  }),

  getGoals: define({
    name: "getGoals",
    description:
      "Goals with status, deadline, overdue, risk state and target attainment (deadline first).",
    input: z
      .object({
        q: term,
        status: listGoalsQuerySchema.shape.status,
        open: z.boolean().optional(),
        risk: listGoalsQuerySchema.shape.risk,
      })
      .strict(),
    async run(db, ctx, input) {
      const r = await createGoalIntelligenceService(db).list(
        ctx,
        parseInput(listGoalsQuerySchema, {
          ...input,
          open: input.open === undefined ? undefined : String(input.open),
          pageSize: String(MAX_ITEMS),
        }),
      );
      return {
        sources: r.data.map((g) =>
          record("goal", g.id, g.title, `/goals/${g.id}`, {
            type: g.type,
            status: g.status,
            deadline: g.deadline,
            overdue: g.overdue,
            risk: g.risk.state,
            attainment: g.attainment.state,
            attainmentProgress: g.attainment.progress,
            milestonesCompleted: g.milestones.completed,
            milestonesTotal: g.milestones.total,
          }),
        ),
        total: r.page.total,
        limitation: limitation(r.page.total, r.data.length, "goals"),
      };
    },
  }),

  getCertifications: define({
    name: "getCertifications",
    description:
      "Certifications with issuer, status, dates and expiry (06: never proof of production expertise).",
    input: z
      .object({
        q: term,
        status: listCertificationsQuerySchema.shape.status,
        expiry: listCertificationsQuerySchema.shape.expiry,
      })
      .strict(),
    async run(db, ctx, input) {
      const r = await createCertificationService(db).list(
        ctx,
        parseInput(listCertificationsQuerySchema, { ...input, pageSize: String(MAX_ITEMS) }),
      );
      return {
        sources: r.data.map((c) =>
          record("certification", c.id, c.name, `/certifications/${c.id}`, {
            issuer: c.issuer,
            status: c.status,
            issueDate: c.issueDate,
            expiryDate: c.expiryDate,
            skills: c.counts.skills,
            evidence: c.counts.evidence,
          }),
        ),
        total: r.page.total,
        limitation: limitation(r.page.total, r.data.length, "certifications"),
      };
    },
  }),

  searchTechnologies: define({
    name: "searchTechnologies",
    description: "Technologies by text or category, with the number of projects using each.",
    input: z.object({ q: term, category: term }).strict(),
    async run(db, ctx, input) {
      const r = await createTechnologyService(db).list(
        ctx,
        parseInput(listTechnologiesQuerySchema, { ...input, pageSize: String(MAX_ITEMS) }),
      );
      return {
        sources: r.data.map((t) =>
          record("technology", t.id, t.name, `/skills/technologies/${t.id}`, {
            category: t.category,
            version: t.version,
            projects: t.counts.projects,
          }),
        ),
        total: r.page.total,
        limitation: limitation(r.page.total, r.data.length, "technologies"),
      };
    },
  }),

  getArchitectureDecisions: define({
    name: "getArchitectureDecisions",
    description:
      "Architecture decision records with status, dates, revisit state and documentation gaps.",
    input: z
      .object({
        q: term,
        status: listDecisionsQuerySchema.shape.status,
        projectId: uuidSchema.optional(),
        revisitDue: z.boolean().optional(),
      })
      .strict(),
    async run(db, ctx, input) {
      const r = await createArchitectureIntelligenceService(db).listDecisions(
        ctx,
        parseInput(listDecisionsQuerySchema, {
          ...input,
          revisitDue: input.revisitDue === undefined ? undefined : String(input.revisitDue),
          pageSize: String(MAX_ITEMS),
        }),
      );
      return {
        sources: r.data.map((d) =>
          record("decision", d.id, d.title, `/architecture/${d.id}`, {
            status: d.status,
            decidedAt: d.decidedAt,
            context: d.context,
            decision: d.decision,
            consequences: d.consequences,
            revisitDate: d.revisitDate,
            revisitDue: d.revisitDue,
            staleCritical: d.staleCritical,
            documentationGaps: d.gaps.join(", ") || null,
            projects: d.counts.projects,
            evidence: d.counts.evidence,
          }),
        ),
        total: r.page.total,
        limitation: limitation(r.page.total, r.data.length, "decisions"),
      };
    },
  }),
};

export type ToolName = keyof typeof TOOLS;
export const TOOL_NAMES = Object.keys(TOOLS) as ToolName[];

export interface ToolCall {
  tool: ToolName;
  input: Record<string, unknown>;
}

export interface ExecutedTool {
  tool: ToolName;
  input: Record<string, unknown>;
  status: "ok" | "rejected" | "failed";
  result: ToolResult | null;
  error: string | null;
  durationMs: number;
}

/**
 * Validate and run one tool as the session user. Unknown tools and invalid inputs are rejected
 * (never executed); domain errors (e.g. a foreign or missing id → NOT_FOUND) become a safe
 * "failed" status without leaking whether the record exists for someone else.
 */
export async function executeTool(
  db: PrismaClient,
  ctx: ServiceContext,
  call: { tool: string; input: unknown },
): Promise<ExecutedTool> {
  const started = performance.now();
  const done = (partial: Omit<ExecutedTool, "durationMs">): ExecutedTool => ({
    ...partial,
    durationMs: Math.round(performance.now() - started),
  });
  if (!(TOOL_NAMES as string[]).includes(call.tool)) {
    return done({
      tool: call.tool as ToolName,
      input: {},
      status: "rejected",
      result: null,
      error: "Unknown tool",
    });
  }
  const tool = TOOLS[call.tool as ToolName] as ToolDefinition<z.ZodType>;
  const parsed = tool.input.safeParse(call.input);
  if (!parsed.success) {
    return done({
      tool: call.tool as ToolName,
      input: {},
      status: "rejected",
      result: null,
      error: "Invalid tool input",
    });
  }
  const input = parsed.data as Record<string, unknown>;
  try {
    const result = await tool.run(db, ctx, input);
    return done({ tool: call.tool as ToolName, input, status: "ok", result, error: null });
  } catch (error) {
    const code = (error as { code?: string }).code;
    return done({
      tool: call.tool as ToolName,
      input,
      status: "failed",
      result: null,
      error: code === "NOT_FOUND" ? "Record not found" : "Tool failed",
    });
  }
}
