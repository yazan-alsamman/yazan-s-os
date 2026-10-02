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
    default:
      return null;
  }
}
