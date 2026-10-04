"use client";

import { BackLink } from "@/components/data/detail";
import { ErrorState, ListSkeleton } from "@/components/data/states";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { METRIC_CATEGORIES } from "@/modules/analytics/metric-catalogue";

import { MetricDefinitionDetails } from "./metric-definition";
import { useMetricCatalogue } from "./use-dashboard";

const CATEGORY_LABELS: Record<(typeof METRIC_CATEGORIES)[number], string> = {
  projects: "Projects",
  evidence: "Evidence",
  skills: "Skills",
  certifications: "Certifications",
  goals: "Goals",
  ai: "AI Lab",
  architecture: "Architecture",
  engineering: "Engineering",
  github: "GitHub",
};

/** Every metric PEOS defines, with its full governance record (05 "Metric Governance"). */
export function MetricCatalogueView() {
  const catalogue = useMetricCatalogue();
  return (
    <>
      <BackLink href="/command-center" label="Command Center" />
      <PageHeader
        title="Metric definitions"
        description="What each Command Center number means, how it is calculated and where it comes from. Specified metrics that cannot be computed yet are listed with the reason."
      />
      {catalogue.isPending ? (
        <ListSkeleton rows={6} />
      ) : catalogue.isError ? (
        <ErrorState error={catalogue.error} onRetry={() => void catalogue.refetch()} />
      ) : (
        <div className="flex flex-col gap-6">
          {METRIC_CATEGORIES.map((category) => {
            const metrics = catalogue.data.filter((m) => m.category === category);
            if (metrics.length === 0) return null;
            return (
              <section key={category} aria-labelledby={`cat-${category}`}>
                <h2 id={`cat-${category}`} className="mb-2 text-h2 font-semibold">
                  {CATEGORY_LABELS[category]}
                </h2>
                <div className="grid gap-3 lg:grid-cols-2">
                  {metrics.map((metric) => (
                    <article
                      key={metric.key}
                      aria-labelledby={`m-${metric.key}`}
                      className="rounded-lg border bg-surface p-4"
                    >
                      <h3
                        id={`m-${metric.key}`}
                        className="mb-2 flex flex-wrap items-center gap-2 text-h3 font-semibold"
                      >
                        {metric.name}
                        {metric.availability.status === "available" ? (
                          <Badge tone="success">Available</Badge>
                        ) : (
                          <Badge tone="warning">Not yet computable</Badge>
                        )}
                      </h3>
                      <MetricDefinitionDetails metric={metric} />
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
