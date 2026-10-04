import { describe, expect, it } from "vitest";

import { availableMetrics } from "@/modules/analytics/metric-catalogue";

import { bucketHref, metricHref } from "./drilldown";

const period = { from: "2026-07-05", to: "2026-10-02" };
const allTime = { from: null, to: null };
/** A realistic bucket key per metric shape (months for trends, pairs for the health matrix). */
const SAMPLE_BUCKET: Record<string, string> = {
  "projects.delivery_trend": "2026-05",
  "projects.milestone_completion_trend": "2026-05",
  "projects.health_comparison": "on_track|poor",
  "projects.evidence_coverage": "true",
  "goals.deadline_load": "2026-Q4",
  "ai.experiments_per_month": "2026-05",
  "architecture.decision_timeline": "2026-05",
  "engineering.activity_trend": "2026-05",
  "engineering.activity_by_domain": "projects",
  "github.repositories_by_visibility": "public",
  "github.repositories_by_type": "original",
  "github.repositories_by_activity": "active",
  "github.language_distribution": "TypeScript",
  "github.commit_trend": "2026-05",
  "github.commits_by_repository": "123",
};

describe("Command Center drill-down mapping", () => {
  it("every available metric has a list drill-down (single values or buckets)", () => {
    for (const metric of availableMetrics()) {
      const f = { projectId: "11111111-1111-4111-8111-111111111111" };
      const single = metricHref(metric.key, f, period);
      const bucket = bucketHref(metric.key, SAMPLE_BUCKET[metric.key] ?? "x", f);
      expect(single ?? bucket, metric.key).not.toBeNull();
    }
  });

  it("maps KPIs to filtered lists and preserves dashboard filters", () => {
    expect(metricHref("projects.active", { projectHealth: "at_risk" }, period)).toBe(
      "/projects?healthStatus=at_risk&lifecycle=active",
    );
    expect(metricHref("projects.completed_in_period", {}, period)).toBe(
      "/projects?completedFrom=2026-07-05&completedTo=2026-10-02&sort=-updatedAt",
    );
    expect(metricHref("projects.completed_in_period", {}, allTime)).toBe(
      "/projects?completedFrom=1900-01-01&sort=-updatedAt",
    );
    expect(metricHref("evidence.velocity", { evidenceType: "document" }, period)).toBe(
      "/evidence?type=document&verified=true&dateFrom=2026-07-05&dateTo=2026-10-02",
    );
    expect(metricHref("evidence.velocity", {}, allTime)).toBe("/evidence?verified=true&dated=true");
    expect(metricHref("evidence.undated", { evidenceVerified: "true" }, period)).toBe(
      "/evidence?verified=true&dated=false",
    );
    expect(metricHref("skills.without_evidence", { skillCategory: "AI" }, period)).toBe(
      "/skills?category=AI&active=true&hasEvidence=false",
    );
    expect(metricHref("certifications.expiring", {}, period)).toBe(
      "/certifications?expiry=expiring&current=true&sort=expiryDate",
    );
    // Architecture became available in Phase 7; technical debt (Phase 9) still has no drill-down.
    expect(metricHref("engineering.technical_debt_trend", {}, period)).toBeNull();
  });

  it("maps distribution buckets, refusing buckets without a list equivalent", () => {
    expect(
      bucketHref("projects.health_distribution", "blocked", { projectStatus: "development" }),
    ).toBe("/projects?status=development&healthStatus=blocked");
    expect(bucketHref("skills.by_category", "Backend & Infra", {})).toBe(
      "/skills?category=Backend+%26+Infra",
    );
    expect(bucketHref("skills.by_category", "__none__", {})).toBeNull();
    expect(bucketHref("certifications.expiry_distribution", "expired", {})).toBe(
      "/certifications?expiry=expired&current=true&sort=expiryDate",
    );
  });

  it("maps Phase 3 milestone, health, technology, evidence and trend metrics", () => {
    const project = { projectId: "p1" };
    expect(metricHref("projects.milestones_overdue", {}, period)).toBe(
      "/projects/milestones?overdue=true",
    );
    expect(metricHref("projects.milestones_overdue", project, period)).toBe(
      "/projects/milestones?projectId=p1&overdue=true",
    );
    expect(metricHref("projects.milestones_completed_in_period", {}, period)).toBe(
      "/projects/milestones?completedFrom=2026-07-05&completedTo=2026-10-02&sort=-completedAt",
    );
    expect(metricHref("projects.milestones_completed_in_period", {}, allTime)).toBe(
      "/projects/milestones?status=completed&sort=-completedAt",
    );
    expect(metricHref("projects.evidence_verified", project, period)).toBe(
      "/evidence?projectId=p1&verified=true",
    );
    expect(metricHref("projects.evidence_linked", {}, period)).toBeNull();
    expect(metricHref("projects.health_score", project, period)).toBe("/projects/p1#health");
    expect(bucketHref("projects.computed_health_distribution", "poor", {})).toBe(
      "/projects/health?computed=poor",
    );
    expect(bucketHref("projects.health_comparison", "at_risk|good", {})).toBe(
      "/projects/health?manual=at_risk&computed=good",
    );
    expect(bucketHref("projects.delivery_trend", "2026-02", {})).toBe(
      "/projects?completedFrom=2026-02-01&completedTo=2026-02-28",
    );
    expect(bucketHref("projects.delivery_trend", "2026-13", {})).toBeNull();
    expect(bucketHref("projects.milestone_completion_trend", "2024-02", {})).toBe(
      "/projects/milestones?completedFrom=2024-02-01&completedTo=2024-02-29&sort=-completedAt",
    );
    expect(bucketHref("projects.evidence_coverage", "maybe", {})).toBeNull();
    expect(bucketHref("projects.evidence_by_type", "demo", project)).toBe(
      "/evidence?projectId=p1&type=demo",
    );
  });
});
