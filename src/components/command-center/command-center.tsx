"use client";

import { BookOpen, RefreshCw } from "lucide-react";
import Link from "next/link";

import { ErrorState, ListSkeleton } from "@/components/data/states";
import { PageHeader } from "@/components/layout/page-header";
import { percent } from "@/components/projects/dossier";
import { Button } from "@/components/ui/button";
import type { DashboardDto } from "@/modules/analytics/dashboard.service";

import { metricHref } from "./drilldown";
import { FilterBar } from "./filter-bar";
import { KpiCard } from "./kpi-card";
import { MetricDefinitionProvider } from "./metric-definition";
import {
  ActivityFeed,
  AttentionPanel,
  CertificationCard,
  EvidenceChartCard,
  EvidenceTimeline,
  ProjectHealthCard,
  SkillSnapshot,
} from "./sections";
import { useDashboard, useDashboardFilters } from "./use-dashboard";

const FIRST_STEPS = [
  { key: "projects", label: "Projects", href: "/projects" },
  { key: "skills", label: "Skills", href: "/skills" },
  { key: "evidence", label: "Evidence", href: "/evidence" },
  { key: "certifications", label: "Certifications", href: "/certifications" },
  { key: "experiences", label: "Experience", href: "/career/experience" },
] as const;

/** Shown while the account holds no records: what exists, what is missing, what to do next. */
function FirstRun({ dashboard }: { dashboard: DashboardDto }) {
  return (
    <section
      aria-labelledby="first-run-title"
      className="mb-5 rounded-lg border border-dashed bg-surface p-5"
    >
      <h2 id="first-run-title" className="text-h2 font-semibold">
        Your Command Center will populate as you add records
      </h2>
      <p className="mt-1 max-w-prose text-muted-foreground">
        Every number here is computed from your own projects, skills, evidence and certifications —
        nothing is estimated or pre-filled. Start by adding records, or import existing data.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {FIRST_STEPS.map((step) => (
          <li key={step.key}>
            <Link
              href={step.href as never}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-body hover:bg-accent"
            >
              {step.label}
              <span className="text-caption text-muted-foreground tabular">
                {dashboard.recordCounts[step.key]}
              </span>
            </Link>
          </li>
        ))}
        <li>
          <Link
            href="/settings/import"
            className="inline-flex items-center rounded-md border px-3 py-1.5 text-body font-medium hover:bg-accent"
          >
            Import data
          </Link>
        </li>
      </ul>
    </section>
  );
}

export function CommandCenter() {
  const { values, drill } = useDashboardFilters();
  const dashboard = useDashboard(values);
  // Lists with their own pagination restart from page 1 when the filters change.
  const sectionKey = JSON.stringify(values);

  return (
    <MetricDefinitionProvider>
      <PageHeader
        title="Command Center"
        description="What you are building, what needs attention and what evidence you produced — computed live from your records."
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/command-center/metrics">
                <BookOpen aria-hidden />
                Metric definitions
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void dashboard.refetch()}
              disabled={dashboard.isFetching}
            >
              <RefreshCw
                aria-hidden
                className={dashboard.isFetching ? "motion-safe:animate-spin" : undefined}
              />
              Refresh
            </Button>
          </>
        }
      />
      <FilterBar />
      <p role="status" aria-live="polite" className="sr-only">
        {dashboard.isFetching
          ? "Updating Command Center…"
          : dashboard.data
            ? "Command Center updated."
            : ""}
      </p>

      {dashboard.isPending ? (
        <div className="rounded-lg border bg-surface">
          <ListSkeleton rows={6} />
        </div>
      ) : dashboard.isError ? (
        <div className="rounded-lg border bg-surface">
          <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-caption text-muted-foreground">
            {dashboard.data.period.label}
            {dashboard.data.period.from &&
              ` (${dashboard.data.period.from} – ${dashboard.data.period.to}, UTC days)`}{" "}
            · Calculated{" "}
            <time dateTime={dashboard.data.calculatedAt}>
              {new Date(dashboard.data.calculatedAt).toLocaleString()}
            </time>{" "}
            · Values without a period describe the current state.
          </p>
          {!dashboard.data.hasAnyData && <FirstRun dashboard={dashboard.data} />}

          <section aria-labelledby="kpi-title">
            <h2 id="kpi-title" className="sr-only">
              Key metrics
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7">
              {dashboard.data.kpis.map((metric) => (
                <KpiCard
                  key={metric.key}
                  metric={metric}
                  href={metricHref(metric.key, drill, dashboard.data.period)}
                  format={metric.key === "skills.coverage" ? percent : undefined}
                  detail={
                    metric.key === "skills.coverage" && metric.breakdown
                      ? `${metric.breakdown[0]!.value} of ${metric.breakdown[0]!.value + metric.breakdown[1]!.value} target skills demonstrated in the last 365 days`
                      : null
                  }
                />
              ))}
            </div>
            <p className="mt-2 text-caption text-muted-foreground">
              AI experiments, architecture decisions and technical debt are specified KPIs that
              cannot be computed yet —{" "}
              <Link href="/command-center/metrics" className="underline underline-offset-4">
                see why
              </Link>
              .
            </p>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <ProjectHealthCard dashboard={dashboard.data} drill={drill} />
            <AttentionPanel dashboard={dashboard.data} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <EvidenceChartCard dashboard={dashboard.data} drill={drill} />
            <EvidenceTimeline key={`timeline-${sectionKey}`} values={values} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
            <SkillSnapshot dashboard={dashboard.data} drill={drill} />
            <CertificationCard dashboard={dashboard.data} drill={drill} />
          </div>

          <ActivityFeed key={`activity-${sectionKey}`} values={values} />
        </div>
      )}
    </MetricDefinitionProvider>
  );
}
