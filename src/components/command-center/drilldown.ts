/**
 * KPI / chart → filtered list (ADR 0020). Each target reproduces the metric's formula with list
 * filters, so the number on the Command Center equals the number of rows the user lands on
 * (integration-tested). Relevant dashboard filters are preserved.
 */
export interface DrillFilters {
  projectStatus?: string;
  projectHealth?: string;
  evidenceType?: string;
  evidenceVerified?: string;
  evidenceOrigin?: string;
  skillCategory?: string;
  /** Phase 3: a single project's dossier metrics drill into that project's records. */
  projectId?: string;
  /** Phase 4: a single skill's metrics drill into that skill's dossier. */
  skillId?: string;
}

export interface DrillPeriod {
  from: string | null;
  to: string | null;
}

/** "Any date" for all-time period drill-downs: everything with a date set. */
const EARLIEST = "1900-01-01";

function href(path: string, params: Record<string, string | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

const projectBase = (f: DrillFilters) => ({
  status: f.projectStatus,
  healthStatus: f.projectHealth,
});
const evidenceBase = (f: DrillFilters) => ({
  type: f.evidenceType,
  verified: f.evidenceVerified,
  origin: f.evidenceOrigin,
});
const skillBase = (f: DrillFilters) => ({ category: f.skillCategory });
/** Phase 4 source list: active skills, keeping the dashboard's skill category filter. */
const skillIntel = (f: DrillFilters, params: Record<string, string | undefined | null>) =>
  href("/skills/intelligence", { category: f.skillCategory, active: "true", ...params });
const milestones = (f: DrillFilters, params: Record<string, string | undefined | null> = {}) =>
  href("/projects/milestones", { projectId: f.projectId, ...params });

/** "YYYY-MM" → inclusive first/last day of the month, or null for anything else. */
export function monthBounds(month: string): { from: string; to: string } | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/** Drill-down for a single-value metric. Returns null for metrics without a list equivalent. */
export function metricHref(key: string, f: DrillFilters, period: DrillPeriod): string | null {
  switch (key) {
    case "projects.total":
      return href("/projects", projectBase(f));
    case "projects.active":
      return href("/projects", { ...projectBase(f), lifecycle: "active" });
    case "projects.production":
      return href("/projects", { ...projectBase(f), lifecycle: "production" });
    case "projects.completed_in_period":
      return href("/projects", {
        ...projectBase(f),
        completedFrom: period.from ?? EARLIEST,
        completedTo: period.to,
        sort: "-updatedAt",
      });
    case "evidence.total":
      return href("/evidence", evidenceBase(f));
    case "evidence.verified":
      return href("/evidence", { ...evidenceBase(f), verified: "true" });
    case "evidence.velocity":
      return href("/evidence", {
        ...evidenceBase(f),
        verified: "true",
        dateFrom: period.from,
        dateTo: period.to,
        dated: period.from ? undefined : "true",
      });
    case "evidence.undated":
      return href("/evidence", { ...evidenceBase(f), dated: "false" });
    case "skills.total":
      return href("/skills", skillBase(f));
    case "skills.active":
      return href("/skills", { ...skillBase(f), active: "true" });
    case "skills.with_target":
      return href("/skills", { ...skillBase(f), hasTarget: "true" });
    case "skills.with_evidence":
      return href("/skills", { ...skillBase(f), hasEvidence: "true" });
    case "skills.without_evidence":
      return href("/skills", { ...skillBase(f), active: "true", hasEvidence: "false" });
    case "certifications.total":
      return "/certifications";
    case "certifications.expiring":
      return href("/certifications", { expiry: "expiring", current: "true", sort: "expiryDate" });
    // ── Phase 3 (ADR 0025) ──
    case "projects.milestones_total":
      return milestones(f);
    case "projects.milestones_completed":
    case "projects.delivery_rate": // numerator list; the denominator adds overdue=true
      return milestones(f, { status: "completed", sort: "-completedAt" });
    case "projects.milestones_completed_in_period":
      return period.from
        ? milestones(f, {
            completedFrom: period.from,
            completedTo: period.to,
            sort: "-completedAt",
          })
        : milestones(f, { status: "completed", sort: "-completedAt" });
    case "projects.milestones_overdue":
      return milestones(f, { overdue: "true" });
    case "projects.milestones_blocked":
      return milestones(f, { status: "blocked" });
    case "projects.health_score":
    case "projects.health_component.schedule":
    case "projects.health_component.milestones":
    case "projects.health_component.blockers":
    case "projects.health_component.recent_activity":
      // Scores are explained by their component breakdown, not by a list (documented exception).
      return f.projectId ? `/projects/${f.projectId}#health` : "/projects/health";
    // ── Phase 4 (ADR 0029) ──
    case "skills.coverage": // numerator list; the denominator drops freshness=fresh
      return skillIntel(f, { hasTarget: "true", freshness: "fresh" });
    case "skills.critical_gaps":
      return skillIntel(f, { critical: "true" });
    case "skills.targets_without_evidence":
      return skillIntel(f, { targetWithoutEvidence: "true" });
    case "skills.production_evidence":
      return skillIntel(f, { productionLinked: "true" });
    case "skills.current_level":
    case "skills.radar":
      // Scores are explained by the skill dossier's rule breakdown (documented exception).
      return f.skillId ? `/skills/${f.skillId}` : skillIntel(f, {});
    case "projects.evidence_linked":
      return f.projectId ? href("/evidence", { projectId: f.projectId }) : null;
    case "projects.evidence_verified":
      return f.projectId ? href("/evidence", { projectId: f.projectId, verified: "true" }) : null;
    default:
      return null;
  }
}

/** Drill-down for one bucket of a distribution metric. */
export function bucketHref(key: string, bucket: string, f: DrillFilters): string | null {
  switch (key) {
    case "projects.health_distribution":
      return href("/projects", { status: f.projectStatus, healthStatus: bucket });
    case "projects.lifecycle_distribution":
      return href("/projects", { status: bucket, healthStatus: f.projectHealth });
    case "skills.by_category":
      // Uncategorised / "other" buckets have no single-category list equivalent.
      return bucket.startsWith("__") ? null : href("/skills", { category: bucket });
    case "certifications.expiry_distribution":
      return href("/certifications", { expiry: bucket, current: "true", sort: "expiryDate" });
    // ── Phase 3 (ADR 0025) ──
    case "skills.freshness":
      return skillIntel(f, { freshness: bucket });
    case "skills.level_distribution":
      return skillIntel(f, { level: bucket });
    case "skills.gap_distribution":
      return skillIntel(f, { gap: bucket });
    case "skills.growth":
      return skillIntel(f, { trend: bucket });
    case "projects.computed_health_distribution":
      return href("/projects/health", { computed: bucket });
    case "projects.health_comparison": {
      const [manual, computed] = bucket.split("|");
      return manual && computed ? href("/projects/health", { manual, computed }) : null;
    }
    case "projects.technology_usage":
      return href("/projects", { technologyId: bucket });
    case "projects.evidence_coverage":
      return bucket === "true" || bucket === "false"
        ? href("/projects", { hasEvidence: bucket })
        : null;
    case "projects.evidence_by_type":
      return f.projectId ? href("/evidence", { projectId: f.projectId, type: bucket }) : null;
    case "projects.delivery_trend": {
      const m = monthBounds(bucket);
      return m ? href("/projects", { completedFrom: m.from, completedTo: m.to }) : null;
    }
    case "projects.milestone_completion_trend": {
      const m = monthBounds(bucket);
      return m
        ? milestones(f, { completedFrom: m.from, completedTo: m.to, sort: "-completedAt" })
        : null;
    }
    default:
      return null;
  }
}
