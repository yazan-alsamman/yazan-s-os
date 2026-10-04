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
  /** Phase 5: a single goal's measures drill into that goal's dossier. */
  goalId?: string;
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
/** Phase 5 source list: the goals list. */
const goalsList = (params: Record<string, string | undefined | null>) => href("/goals", params);
/** Phase 7 source lists: architecture decisions and components. */
const decisionsList = (params: Record<string, string | undefined | null>) =>
  href("/architecture", params);
const componentsList = (params: Record<string, string | undefined | null>) =>
  href("/architecture/components", params);
/** Phase 6 source list: the experiments list. */
const experimentsList = (params: Record<string, string | undefined | null>) =>
  href("/ai-lab", params);

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
    // ── Phase 5 (ADR 0034) ──
    case "goals.total":
      return goalsList({});
    case "goals.active":
      return goalsList({ status: "active" });
    case "goals.overdue":
      return goalsList({ overdue: "true" });
    case "goals.completion_rate": // numerator; the denominator adds overdue=true
      return goalsList({ status: "completed" });
    case "goals.at_risk":
      return goalsList({ risk: "at_risk", sort: "risk" });
    case "goals.on_track":
      return goalsList({ risk: "on_track" });
    case "goals.target_attainment": // numerator
      return goalsList({ committed: "true", attainment: "attained" });
    case "goals.without_deadline":
      return goalsList({ open: "true", hasDeadline: "false" });
    case "goals.without_projects":
      return goalsList({ open: "true", hasProjects: "false" });
    case "goals.without_skills":
      return goalsList({ open: "true", hasSkills: "false" });
    case "goals.with_skill_gaps":
      return goalsList({ open: "true", skillGap: "true" });
    case "goals.milestone_progress":
    case "goals.burndown":
      // Per-goal measures are explained in the goal dossier (documented exception).
      return f.goalId ? `/goals/${f.goalId}` : goalsList({});
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
    // ── Phase 6 — AI Lab (ADR 0038) ──
    case "ai.experiments":
      return experimentsList({});
    case "ai.active_experiments":
      return experimentsList({ open: "true" });
    case "ai.completed_experiments":
      return experimentsList({ status: "completed" });
    case "ai.abandoned_experiments":
      return experimentsList({ status: "abandoned" });
    case "ai.runs_total":
      return experimentsList({ hasRuns: "true" });
    case "ai.adoption_rate": // numerator; denominator adds the other decisions
      return experimentsList({ decision: "adopt" });
    case "ai.evaluation_coverage": // numerator
      return experimentsList({ hasEvaluation: "true" });
    case "ai.experiments_missing_evaluation":
      return experimentsList({ hasRuns: "true", hasEvaluation: "false" });
    case "ai.experiments_missing_provenance":
      return experimentsList({ hasEvidence: "false" });
    // ── Phase 7 — Architecture Intelligence (ADR 0045) ──
    case "architecture.decisions":
      return decisionsList({});
    case "architecture.decisions_in_force":
      return decisionsList({ inForce: "true" });
    case "architecture.revisit_due":
      return decisionsList({ revisitDue: "true", sort: "revisitDate" });
    case "architecture.stale_critical_decisions":
      return decisionsList({ staleCritical: "true", sort: "revisitDate" });
    case "architecture.decisions_without_evidence":
      return decisionsList({ hasEvidence: "false" });
    case "architecture.decisions_with_gaps":
      return decisionsList({ incomplete: "true" });
    case "architecture.project_coverage": // numerator; the denominator is all projects
      return href("/projects", { hasArchitecture: "true" });
    case "architecture.components":
      return componentsList({});
    case "architecture.critical_components":
      return componentsList({ critical: "true" });
    case "architecture.components_without_decisions":
      return componentsList({ hasDecisions: "false" });
    // Phase 9: the engineering-activity KPI drills to the Engineering Analytics detail for the period.
    case "engineering.activity":
      return href(
        "/analytics",
        period.from && period.to ? { range: "custom", from: period.from, to: period.to } : {},
      );
    // Phase 9.6: GitHub Repository Intelligence.
    case "github.repositories_total":
      return "/github/repositories";
    case "github.repositories_active":
      return href("/github/repositories", { activity: "recent" });
    case "github.commits":
    case "github.active_days":
      return "/github/analytics";
    // Phase 9.7: GitHub Intelligence Expansion.
    case "github.pull_requests":
    case "github.pull_request_trend":
    case "github.pull_requests_merge_rate":
    case "github.personal_pull_requests":
      return "/github/pull-requests";
    case "github.pull_requests_merged":
    case "github.pull_request_time_to_merge":
      return href("/github/pull-requests", { state: "merged" });
    case "github.pull_requests_open":
      return href("/github/pull-requests", { state: "open" });
    case "github.issues":
    case "github.issue_trend":
    case "github.issue_closure_rate":
    case "github.personal_issues":
      return "/github/issues";
    case "github.issues_closed":
      return href("/github/issues", { state: "closed" });
    case "github.issues_open":
      return href("/github/issues", { state: "open" });
    case "github.releases":
    case "github.release_trend":
      return "/github/releases";
    case "github.contributors":
      return "/github/contributors";
    case "github.activity":
    case "github.activity_trend":
      return "/github/activity";
    case "github.activity_heatmap":
    case "github.commit_longest_gap":
    case "github.personal_commits":
    case "github.personal_active_days":
      return "/github/analytics";
    case "github.personal_repositories":
      return "/github/repositories";
    default:
      return null;
  }
}

/** Phase 9: the list page for one engineering-activity domain (period-filtered on the surface). */
const ENGINEERING_DOMAIN_LIST: Record<string, string> = {
  projects: "/projects",
  milestones: "/projects/milestones",
  evidence: "/evidence",
  goals: "/goals",
  architecture: "/architecture",
  experiments: "/ai-lab",
  certifications: "/certifications",
};

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
    case "goals.risk_distribution":
      return goalsList({ risk: bucket });
    case "goals.status_distribution":
      return goalsList({ status: bucket });
    case "goals.attainment_distribution":
      return goalsList({ committed: "true", attainment: bucket });
    case "goals.deadline_load": {
      if (bucket === "overdue") return goalsList({ open: "true", overdue: "true" });
      if (bucket === "none") return goalsList({ open: "true", hasDeadline: "false" });
      const after = /^after:(\d{4}-\d{2}-\d{2})$/.exec(bucket);
      if (after) return goalsList({ open: "true", overdue: "false", deadlineFrom: after[1] });
      const quarter = /^(\d{4})-Q([1-4])$/.exec(bucket);
      if (!quarter) return null;
      const y = Number(quarter[1]);
      const q = Number(quarter[2]);
      const from = `${y}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01`;
      const last = new Date(Date.UTC(y, q * 3, 0)).getUTCDate();
      const to = `${y}-${String(q * 3).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
      return goalsList({ open: "true", overdue: "false", deadlineFrom: from, deadlineTo: to });
    }
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
    // ── Phase 6 — AI Lab (ADR 0038) ──
    case "ai.experiments_by_status":
      return experimentsList({ status: bucket });
    case "ai.experiments_by_decision":
      // "undecided" has no list filter (decision IS NULL).
      return bucket === "undecided" ? null : experimentsList({ decision: bucket });
    case "ai.experiments_by_category":
      return bucket === "__none" ? null : experimentsList({ category: bucket });
    case "ai.reproducibility_distribution":
      return experimentsList({ reproducibility: bucket });
    case "architecture.decisions_by_status":
      return decisionsList({ status: bucket });
    case "architecture.components_by_type":
      return componentsList({ type: bucket });
    case "architecture.decision_timeline": {
      const m = monthBounds(bucket);
      return m ? decisionsList({ decidedFrom: m.from, decidedTo: m.to }) : null;
    }
    case "ai.experiments_per_month": {
      const m = monthBounds(bucket);
      return m ? experimentsList({ createdFrom: m.from, createdTo: m.to }) : null;
    }
    case "engineering.activity_trend": {
      const m = monthBounds(bucket);
      return m ? href("/analytics", { range: "custom", from: m.from, to: m.to }) : null;
    }
    case "engineering.activity_by_domain":
      return ENGINEERING_DOMAIN_LIST[bucket] ?? null;
    // Phase 9.6: GitHub distributions drill into the repository explorer / analytics.
    case "github.repositories_by_visibility":
      return href("/github/repositories", { visibility: bucket });
    case "github.repositories_by_type":
      return href("/github/repositories", { type: bucket });
    case "github.repositories_by_activity":
      return href("/github/repositories", { activity: bucket === "active" ? "recent" : bucket });
    case "github.language_distribution":
      return href("/github/repositories", { language: bucket });
    case "github.commit_trend":
      return "/github/analytics";
    case "github.commits_by_repository":
      return `/github/repositories/${bucket}`;
    // Phase 9.7 distributions.
    case "github.pull_requests_by_state":
      return href("/github/pull-requests", { state: bucket });
    case "github.pull_requests_by_repository":
      return href("/github/pull-requests", { repo: bucket });
    case "github.issues_by_state":
      return href("/github/issues", { state: bucket });
    case "github.issues_by_repository":
      return href("/github/issues", { repo: bucket });
    case "github.issue_labels":
      return href("/github/issues", { label: bucket });
    case "github.releases_by_repository":
      return href("/github/releases", { repo: bucket });
    case "github.contributors_by_repository":
      return href("/github/contributors", { repo: bucket });
    case "github.contributor_activity":
    case "github.commits_by_author":
      return "/github/contributors";
    case "github.activity_by_repository":
      return href("/github/activity", { repo: bucket });
    case "github.commits_by_day_of_week":
    case "github.commits_by_hour":
      return "/github/analytics";
    default:
      return null;
  }
}
