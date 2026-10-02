import { describe, expect, it } from "vitest";

import { availableMetrics } from "@/modules/analytics/metric-catalogue";

import { bucketHref, metricHref } from "./drilldown";

const period = { from: "2026-07-05", to: "2026-10-02" };
const allTime = { from: null, to: null };

describe("Command Center drill-down mapping", () => {
  it("every available metric has a list drill-down (single values or buckets)", () => {
    for (const metric of availableMetrics()) {
      const single = metricHref(metric.key, {}, period);
      const bucket = bucketHref(metric.key, "x", {});
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
    expect(metricHref("goals.active", {}, period)).toBeNull();
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
});
