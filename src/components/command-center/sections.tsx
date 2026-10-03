"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ChartCard } from "@/components/charts/chart-card";
import { EChart, type ChartPalette } from "@/components/charts/echart";
import { formatDate } from "@/components/data/detail";
import { ErrorState, ListSkeleton } from "@/components/data/states";
import { EVIDENCE_TYPE_OPTIONS, labelOf } from "@/components/records/options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchJson, withQuery } from "@/lib/http/fetch-json";
import type { ActivityItem } from "@/modules/analytics/activity.service";
import type { DashboardDto } from "@/modules/analytics/dashboard.service";
import type { DistributionBucket, MetricResult } from "@/modules/analytics/metric-result";

import { bucketHref, metricHref, type DrillFilters } from "./drilldown";
import { useShowDefinition } from "./metric-definition";
import type { FilterKey } from "./use-dashboard";

type Values = Partial<Record<FilterKey, string>>;
const n = (v: number) => new Intl.NumberFormat().format(v);

function Meta({ dashboard, metric }: { dashboard: DashboardDto; metric: MetricResult }) {
  const parts = [
    metric.temporal === "period" ? dashboard.period.label : "Current state",
    `Source: ${metric.source.join(", ")}`,
    metric.filtersApplied.length ? `Filters: ${metric.filtersApplied.join(", ")}` : null,
    `Calculated ${new Date(dashboard.calculatedAt).toLocaleTimeString()}`,
  ].filter(Boolean);
  return <>{parts.join(" · ")}</>;
}

function EmptySection({
  text,
  action,
}: {
  text: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-start gap-2 p-4 text-muted-foreground">
      <p>{text}</p>
      {action && (
        <Link
          href={action.href as never}
          className="font-medium text-foreground underline underline-offset-4"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** Horizontal bar option for a distribution (labels + values on bars: never colour alone). */
export function distributionOption(
  buckets: DistributionBucket[],
  colors: (p: ChartPalette, key: string) => string,
) {
  // Reserve the label gutter explicitly: ECharts measures labels with its own font metrics, which
  // under-measures the app font and clipped long labels ("Expiring (90 days)") with containLabel.
  const longest = Math.max(...buckets.map((b) => b.label.length), 4);
  const labelWidth = Math.min(170, Math.ceil(longest * 7.2) + 8);
  return (p: ChartPalette) => ({
    grid: { left: labelWidth + 12, right: 40, top: 8, bottom: 24, containLabel: false },
    tooltip: { trigger: "item" },
    xAxis: {
      type: "value",
      minInterval: 1,
      axisLabel: { color: p.mutedText },
      splitLine: { lineStyle: { color: p.grid } },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: buckets.map((b) => b.label),
      axisLabel: { color: p.text, width: labelWidth, overflow: "truncate" },
    },
    series: [
      {
        type: "bar",
        data: buckets.map((b) => ({ value: b.value, itemStyle: { color: colors(p, b.key) } })),
        label: { show: true, position: "right", color: p.text },
        barMaxWidth: 22,
        cursor: "pointer",
      },
    ],
  });
}

export function distributionTable(metric: MetricResult, hrefFor: (key: string) => string | null) {
  return {
    caption: metric.name,
    columns: ["Count"],
    rows: (metric.breakdown ?? []).map((b) => ({
      label: b.label,
      values: [b.value],
      href: hrefFor(b.key),
    })),
  };
}

// ── Project health ─────────────────────────────────────────────────────────

const HEALTH_COLOR: Record<string, keyof ChartPalette> = {
  on_track: "success",
  at_risk: "warning",
  blocked: "danger",
  not_assessed: "neutral",
};

export function ProjectHealthCard({
  dashboard,
  drill,
}: {
  dashboard: DashboardDto;
  drill: DrillFilters;
}) {
  const router = useRouter();
  const showDefinition = useShowDefinition();
  const metric = dashboard.projects.health;
  const buckets = metric.breakdown ?? [];
  const get = (key: string) => buckets.find((b) => b.key === key)?.value ?? 0;
  const total = metric.value ?? 0;
  const hrefFor = (key: string) => bucketHref(metric.key, key, drill);
  const interpretation =
    metric.state === "ok"
      ? `${get("at_risk") + get("blocked")} of ${total} projects are at risk or blocked; ${get("not_assessed")} not assessed.`
      : null;
  return (
    <ChartCard
      title="Project health"
      interpretation={interpretation}
      meta={<Meta dashboard={dashboard} metric={metric} />}
      onShowDefinition={() => showDefinition(metric.key)}
      csvName="project-health"
      table={metric.state === "ok" ? distributionTable(metric, hrefFor) : null}
      empty={
        metric.state === "no_data" ? (
          <EmptySection
            text="No projects yet. Project health appears once projects exist."
            action={{ href: "/projects", label: "Add a project" }}
          />
        ) : metric.state === "zero" ? (
          <EmptySection text="No projects match the current filters." />
        ) : undefined
      }
    >
      <EChart
        dataKey={JSON.stringify(buckets)}
        height={180}
        ariaLabel={`Bar chart of project health: ${buckets.map((b) => `${b.label} ${b.value}`).join(", ")}.`}
        option={distributionOption(buckets, (p, key) => p[HEALTH_COLOR[key] ?? "neutral"])}
        onSelect={(i) => {
          const target = hrefFor(buckets[i]?.key ?? "");
          if (target) router.push(target as never);
        }}
      />
      <p className="text-caption text-muted-foreground">
        This chart shows your manual assessment. The computed health signal (schedule, milestones,
        blockers, activity) is shown on each project and in{" "}
        <Link href="/projects/portfolio" className="underline underline-offset-4">
          Projects → Portfolio
        </Link>
        .
      </p>
    </ChartCard>
  );
}

// ── Attention ──────────────────────────────────────────────────────────────

export function AttentionPanel({ dashboard }: { dashboard: DashboardDto }) {
  const projects = dashboard.projects.attention;
  const certs = dashboard.certifications.attention;
  const overdue = dashboard.projects.overdueMilestones;
  const goals = dashboard.goals.attention;
  const stale = dashboard.architecture.attention.staleCritical;
  const empty =
    projects.length === 0 &&
    certs.length === 0 &&
    overdue.length === 0 &&
    goals.length === 0 &&
    stale.length === 0;
  return (
    <section aria-labelledby="attention-title" className="rounded-lg border bg-surface">
      <header className="border-b px-4 py-3">
        <h2 id="attention-title" className="text-h3 font-semibold">
          Needs attention
        </h2>
        <p className="mt-1 text-caption text-muted-foreground">
          Blocked or at-risk projects (not archived), overdue milestones, stale critical
          architecture decisions (revisit date passed, governing a critical component), goals at
          risk, and certifications expired or expiring within 90 days. Up to 10 each.
        </p>
      </header>
      {empty ? (
        <p className="p-4 text-muted-foreground">
          {dashboard.hasAnyData
            ? "Nothing flagged: no blocked or at-risk projects, no overdue milestones, no expiring certifications."
            : "Nothing to review yet."}
        </p>
      ) : (
        <ul className="divide-y">
          {projects.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-2">
              <Link
                href={`/projects/${p.id}` as never}
                className="min-w-0 truncate font-medium hover:underline"
              >
                {p.name}
              </Link>
              <Badge tone={p.healthStatus === "blocked" ? "danger" : "warning"}>
                <AlertTriangle aria-hidden className="size-3" />
                {p.healthStatus === "blocked" ? "Blocked" : "At risk"}
              </Badge>
            </li>
          ))}
          {overdue.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 px-4 py-2">
              <Link
                href={`/projects/${m.project.id}#milestones` as never}
                className="min-w-0 truncate font-medium hover:underline"
              >
                {m.title}
                <span className="font-normal text-muted-foreground"> · {m.project.name}</span>
              </Link>
              <Badge tone="danger">Overdue since {formatDate(m.dueDate)}</Badge>
            </li>
          ))}
          {stale.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <Link
                href={`/architecture/${d.id}` as never}
                className="min-w-0 font-medium hover:underline"
              >
                {d.title}
                <span className="block text-caption font-normal text-muted-foreground">
                  Revisit was due {formatDate(d.revisitDate)} · governs {d.criticalComponents}{" "}
                  critical component{d.criticalComponents === 1 ? "" : "s"}
                </span>
              </Link>
              <Badge tone="danger">Stale critical decision</Badge>
            </li>
          ))}
          {goals.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <Link
                href={`/goals/${g.id}` as never}
                className="min-w-0 font-medium hover:underline"
              >
                {g.title}
                <span className="block text-caption font-normal text-muted-foreground">
                  {g.signals.join("; ")}
                </span>
              </Link>
              <Badge tone="warning">Goal at risk</Badge>
            </li>
          ))}
          {certs.map((c) => {
            const expired =
              c.expiryDate !== null && c.expiryDate < dashboard.calculatedAt.slice(0, 10);
            return (
              <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2">
                <Link
                  href={`/certifications/${c.id}` as never}
                  className="min-w-0 truncate font-medium hover:underline"
                >
                  {c.name}
                </Link>
                <Badge tone={expired ? "danger" : "warning"}>
                  {expired ? "Expired" : "Expires"} {formatDate(c.expiryDate)}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ── Evidence ───────────────────────────────────────────────────────────────

export function EvidenceChartCard({
  dashboard,
  drill,
}: {
  dashboard: DashboardDto;
  drill: DrillFilters;
}) {
  const showDefinition = useShowDefinition();
  const metric = dashboard.evidence.velocity;
  const { points, truncated } = dashboard.evidence.monthly;
  const datedInPeriod = points.reduce((sum, p) => sum + p.verified + p.unverified, 0);
  const verifiedInPeriod = points.reduce((sum, p) => sum + p.verified, 0);
  const monthHref = (month: string) => {
    const [y, m] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
    // Clamp to the period so a partial first/last month lists exactly what its bar counted.
    const { from, to } = dashboard.period;
    const start = `${month}-01`;
    const end = `${month}-${String(last).padStart(2, "0")}`;
    return withQuery("/evidence", {
      dateFrom: from && from > start ? from : start,
      dateTo: to && to < end ? to : end,
      type: drill.evidenceType,
      verified: drill.evidenceVerified,
      origin: drill.evidenceOrigin,
    });
  };
  const hasDated = datedInPeriod > 0;
  return (
    <ChartCard
      title="Evidence over time"
      interpretation={
        hasDated
          ? `${n(datedInPeriod)} dated evidence items in this period, ${n(verifiedInPeriod)} of them verified.`
          : null
      }
      meta={<Meta dashboard={dashboard} metric={metric} />}
      onShowDefinition={() => showDefinition(metric.key)}
      csvName="evidence-by-month"
      table={
        hasDated
          ? {
              caption: "Evidence by month",
              columns: ["Verified", "Unverified"],
              rows: points.map((p) => ({
                label: p.month,
                values: [p.verified, p.unverified],
                href: monthHref(p.month),
              })),
            }
          : null
      }
      empty={
        metric.state === "no_data" ? (
          <EmptySection
            text="No evidence yet."
            action={{ href: "/evidence", label: "Add evidence" }}
          />
        ) : !hasDated ? (
          <EmptySection
            text={`No dated evidence ${dashboard.period.range === "all" ? "yet" : "in this period"}. Evidence without a date never appears here.`}
          />
        ) : undefined
      }
    >
      <EChart
        dataKey={JSON.stringify(points)}
        height={220}
        ariaLabel={`Stacked bar chart of evidence per month, ${dashboard.period.label}: ${n(verifiedInPeriod)} verified and ${n(datedInPeriod - verifiedInPeriod)} unverified items.`}
        option={(p) => ({
          grid: { left: 8, right: 8, top: 32, bottom: 8, containLabel: true },
          tooltip: { trigger: "axis" },
          legend: { top: 0, textStyle: { color: p.text } },
          xAxis: {
            type: "category",
            data: points.map((x) => x.month),
            axisLabel: { color: p.mutedText },
          },
          yAxis: {
            type: "value",
            minInterval: 1,
            axisLabel: { color: p.mutedText },
            splitLine: { lineStyle: { color: p.grid } },
          },
          series: [
            {
              name: "Verified",
              type: "bar",
              stack: "total",
              data: points.map((x) => x.verified),
              itemStyle: { color: p.brand },
            },
            {
              name: "Unverified",
              type: "bar",
              stack: "total",
              data: points.map((x) => x.unverified),
              itemStyle: { color: p.neutral },
            },
          ],
        })}
      />
      {truncated && (
        <p className="text-caption text-muted-foreground">Showing the latest 120 months.</p>
      )}
    </ChartCard>
  );
}

interface TimelineResponse {
  data: {
    id: string;
    title: string;
    type: string;
    date: string;
    verified: boolean;
    origin: string;
    related: { kind: string; id: string; label: string; href: string }[];
    counts: { projects: number; skills: number; certifications: number; experiences: number };
  }[];
  page: { page: number; totalPages: number; total: number };
  undatedCount: number;
}

export function EvidenceTimeline({ values }: { values: Values }) {
  const [page, setPage] = useState(1);
  const params = {
    range: values.range,
    from: values.from,
    to: values.to,
    evidenceType: values.evidenceType,
    evidenceVerified: values.evidenceVerified,
    evidenceOrigin: values.evidenceOrigin,
    page,
    pageSize: 10,
  };
  const timeline = useQuery({
    queryKey: ["analytics", "timeline", params],
    queryFn: () =>
      fetchJson<TimelineResponse>(withQuery("/api/v1/analytics/evidence-timeline", params)),
    staleTime: 0,
    enabled: !(values.range === "custom" && (!values.from || !values.to)),
  });
  return (
    <section aria-labelledby="timeline-title" className="rounded-lg border bg-surface">
      <header className="border-b px-4 py-3">
        <h2 id="timeline-title" className="text-h3 font-semibold">
          Evidence timeline
        </h2>
        <p className="mt-1 text-caption text-muted-foreground">
          By evidence date, newest first. Source: Evidence and its links. Same date range and
          evidence filters as above.
        </p>
      </header>
      {timeline.isPending ? (
        <ListSkeleton rows={4} />
      ) : timeline.isError ? (
        <ErrorState error={timeline.error} onRetry={() => void timeline.refetch()} />
      ) : (
        <>
          {timeline.data.data.length === 0 ? (
            <p className="p-4 text-muted-foreground">No dated evidence in this period.</p>
          ) : (
            <ol className="divide-y" aria-label="Evidence, newest first">
              {timeline.data.data.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-start sm:gap-4"
                >
                  <time
                    dateTime={e.date}
                    className="w-28 shrink-0 text-caption text-muted-foreground tabular"
                  >
                    {formatDate(e.date)}
                  </time>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/evidence/${e.id}` as never}
                        className="font-medium hover:underline"
                      >
                        {e.title}
                      </Link>
                      <Badge>{labelOf(EVIDENCE_TYPE_OPTIONS, e.type)}</Badge>
                      {e.verified ? (
                        <Badge tone="success">Verified</Badge>
                      ) : (
                        <Badge>Unverified</Badge>
                      )}
                      {e.origin === "import" && <Badge tone="info">Imported</Badge>}
                    </div>
                    {e.related.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-caption">
                        {e.related.map((r) => (
                          <Link
                            key={`${r.kind}-${r.id}`}
                            href={r.href as never}
                            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
                          >
                            {r.kind}: {r.label}
                          </Link>
                        ))}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
            <p className="text-caption text-muted-foreground">
              {timeline.data.undatedCount > 0 ? (
                <>
                  {n(timeline.data.undatedCount)} evidence item
                  {timeline.data.undatedCount === 1 ? " has" : "s have"} no date and
                  {timeline.data.undatedCount === 1 ? " is" : " are"} not shown.{" "}
                  <Link
                    href={"/evidence?dated=false" as never}
                    className="underline underline-offset-4"
                  >
                    Review undated evidence
                  </Link>
                </>
              ) : (
                `${n(timeline.data.page.total)} dated items`
              )}
            </p>
            {timeline.data.page.totalPages > 1 && (
              <nav aria-label="Timeline pages" className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft aria-hidden />
                  Newer
                </Button>
                <span className="px-1 text-caption tabular">
                  {page} / {timeline.data.page.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= timeline.data.page.totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Older
                  <ChevronRight aria-hidden />
                </Button>
              </nav>
            )}
          </div>
        </>
      )}
    </section>
  );
}

// ── Skills ─────────────────────────────────────────────────────────────────

export function SkillSnapshot({
  dashboard,
  drill,
}: {
  dashboard: DashboardDto;
  drill: DrillFilters;
}) {
  const router = useRouter();
  const showDefinition = useShowDefinition();
  const s = dashboard.skills;
  const metric = s.byCategory;
  const buckets = metric.breakdown ?? [];
  const hrefFor = (key: string) => bucketHref(metric.key, key, drill);
  const facts = [s.total, s.active, s.withTarget, s.withEvidence, s.withoutEvidence];
  return (
    <ChartCard
      title="Skill snapshot"
      interpretation={
        metric.state === "ok"
          ? `${n(s.withEvidence.value ?? 0)} of ${n(s.total.value ?? 0)} skills have linked evidence. Evidence-derived levels, gaps and freshness are in Skills → Intelligence.`
          : null
      }
      meta={<Meta dashboard={dashboard} metric={metric} />}
      onShowDefinition={() => showDefinition(metric.key)}
      csvName="skills-by-category"
      table={metric.state === "ok" ? distributionTable(metric, hrefFor) : null}
      empty={
        metric.state === "no_data" ? (
          <EmptySection text="No skills yet." action={{ href: "/skills", label: "Add a skill" }} />
        ) : metric.state === "zero" ? (
          <EmptySection text="No skills match the selected category." />
        ) : undefined
      }
    >
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {facts.map((m) => {
          const href = metricHref(m.key, drill, dashboard.period);
          return (
            <div key={m.key} className="rounded-md bg-surface-sunken px-2 py-1.5">
              <dt className="flex items-center justify-between gap-1 text-caption text-muted-foreground">
                {m.name}
                <button
                  type="button"
                  className="sr-only focus:not-sr-only"
                  onClick={() => showDefinition(m.key)}
                >
                  Definition of {m.name}
                </button>
              </dt>
              <dd className="font-semibold tabular">
                {href && m.value !== null ? (
                  <Link
                    href={href as never}
                    className="hover:underline"
                    aria-label={`${m.name}: ${m.value}. View the skills`}
                  >
                    {n(m.value)}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {buckets.length > 0 && (
        <EChart
          dataKey={JSON.stringify(buckets)}
          height={Math.max(120, buckets.length * 28 + 16)}
          ariaLabel={`Bar chart of skills by category: ${buckets.map((b) => `${b.label} ${b.value}`).join(", ")}.`}
          option={distributionOption(buckets, (p, key) =>
            key.startsWith("__") ? p.neutral : p.brand,
          )}
          onSelect={(i) => {
            const target = hrefFor(buckets[i]?.key ?? "");
            if (target) router.push(target as never);
          }}
        />
      )}
      {s.top.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body">
            <caption className="py-1 text-left text-caption text-muted-foreground">
              Skills with the most linked evidence (up to 10) and their latest evidence date
            </caption>
            <thead className="text-caption text-muted-foreground">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Skill
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Category
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  Evidence
                </th>
                <th scope="col" className="py-1 font-medium">
                  Latest evidence date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {s.top.map((skill) => (
                <tr key={skill.id}>
                  <th scope="row" className="py-1 pr-3 font-normal">
                    <Link
                      href={`/skills/${skill.id}` as never}
                      className="underline underline-offset-4"
                    >
                      {skill.name}
                    </Link>
                  </th>
                  <td className="py-1 pr-3">{skill.category ?? "—"}</td>
                  <td className="py-1 pr-3 text-right tabular">{skill.evidenceCount}</td>
                  <td className="py-1 tabular">
                    {formatDate(skill.latestEvidenceDate) ?? "No dated evidence"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}

// ── Certifications ─────────────────────────────────────────────────────────

const EXPIRY_COLOR: Record<string, keyof ChartPalette> = {
  valid: "success",
  expiring: "warning",
  expired: "danger",
  no_expiry: "neutral",
};

export function CertificationCard({
  dashboard,
  drill,
}: {
  dashboard: DashboardDto;
  drill: DrillFilters;
}) {
  const router = useRouter();
  const showDefinition = useShowDefinition();
  const metric = dashboard.certifications.expiry;
  const buckets = metric.breakdown ?? [];
  const get = (key: string) => buckets.find((b) => b.key === key)?.value ?? 0;
  const hrefFor = (key: string) => bucketHref(metric.key, key, drill);
  return (
    <ChartCard
      title="Certification expiry"
      interpretation={
        metric.state === "ok"
          ? `${get("expiring")} expiring within 90 days, ${get("expired")} expired, ${get("valid")} valid, ${get("no_expiry")} without an expiry date.`
          : metric.state === "zero"
            ? "All recorded certifications are revoked."
            : null
      }
      meta={<Meta dashboard={dashboard} metric={metric} />}
      onShowDefinition={() => showDefinition(metric.key)}
      csvName="certification-expiry"
      table={metric.state === "ok" ? distributionTable(metric, hrefFor) : null}
      empty={
        metric.state === "no_data" ? (
          <EmptySection
            text="No certifications yet."
            action={{ href: "/certifications", label: "Add a certification" }}
          />
        ) : metric.state === "zero" ? (
          <EmptySection text="No current (non-revoked) certifications." />
        ) : undefined
      }
    >
      <EChart
        dataKey={JSON.stringify(buckets)}
        height={170}
        ariaLabel={`Bar chart of certification expiry: ${buckets.map((b) => `${b.label} ${b.value}`).join(", ")}.`}
        option={distributionOption(buckets, (p, key) => p[EXPIRY_COLOR[key] ?? "neutral"])}
        onSelect={(i) => {
          const target = hrefFor(buckets[i]?.key ?? "");
          if (target) router.push(target as never);
        }}
      />
    </ChartCard>
  );
}

// ── Activity ───────────────────────────────────────────────────────────────

interface ActivityResponse {
  data: ActivityItem[];
  page: { page: number; totalPages: number; total: number };
}

export function ActivityFeed({ values }: { values: Values }) {
  const [page, setPage] = useState(1);
  const params = { range: values.range, from: values.from, to: values.to, page, pageSize: 15 };
  const activity = useQuery({
    queryKey: ["analytics", "activity", params],
    queryFn: () => fetchJson<ActivityResponse>(withQuery("/api/v1/analytics/activity", params)),
    staleTime: 0,
    enabled: !(values.range === "custom" && (!values.from || !values.to)),
  });
  return (
    <section aria-labelledby="activity-title" className="rounded-lg border bg-surface">
      <header className="border-b px-4 py-3">
        <h2 id="activity-title" className="text-h3 font-semibold">
          Recent activity
        </h2>
        <p className="mt-1 text-caption text-muted-foreground">
          Your changes in the selected date range, from your audit log. Sign-in events are not
          shown.
        </p>
      </header>
      {activity.isPending ? (
        <ListSkeleton rows={4} />
      ) : activity.isError ? (
        <ErrorState error={activity.error} onRetry={() => void activity.refetch()} />
      ) : activity.data.data.length === 0 ? (
        <p className="p-4 text-muted-foreground">No activity in this period.</p>
      ) : (
        <>
          <ol className="divide-y" aria-label="Activity, newest first">
            {activity.data.data.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-0.5 px-4 py-2 sm:flex-row sm:items-baseline sm:gap-4"
              >
                <time
                  dateTime={item.at}
                  className="w-40 shrink-0 text-caption text-muted-foreground tabular"
                >
                  {new Date(item.at).toLocaleString()}
                </time>
                <p className="min-w-0 flex-1">
                  <span className="text-muted-foreground">{item.summary}</span>
                  {item.label && (
                    <>
                      {" "}
                      {item.href ? (
                        <Link
                          href={item.href as never}
                          className="font-medium underline underline-offset-4"
                        >
                          {item.label}
                        </Link>
                      ) : (
                        <span className="font-medium">{item.label}</span>
                      )}
                    </>
                  )}
                  {!item.label && item.href && (
                    <>
                      {" "}
                      <Link href={item.href as never} className="underline underline-offset-4">
                        Open
                      </Link>
                    </>
                  )}
                  {item.deleted && <Badge className="ml-2">Deleted</Badge>}
                </p>
              </li>
            ))}
          </ol>
          {activity.data.page.totalPages > 1 && (
            <nav
              aria-label="Activity pages"
              className="flex items-center justify-end gap-1 border-t px-4 py-2"
            >
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft aria-hidden />
                Newer
              </Button>
              <span className="px-1 text-caption tabular">
                {page} / {activity.data.page.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= activity.data.page.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Older
                <ChevronRight aria-hidden />
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
