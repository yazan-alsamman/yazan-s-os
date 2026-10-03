"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, type ReactNode } from "react";

import { ChartCard } from "@/components/charts/chart-card";
import { EChart, type ChartPalette } from "@/components/charts/echart";
import { KpiCard } from "@/components/command-center/kpi-card";
import {
  MetricDefinitionProvider,
  useShowDefinition,
} from "@/components/command-center/metric-definition";
import { distributionOption, distributionTable } from "@/components/command-center/sections";
import { ErrorState, ListSkeleton } from "@/components/data/states";
import { useUrlState } from "@/components/data/use-url-state";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useApiGet } from "@/lib/api/hooks";
import { withQuery } from "@/lib/http/fetch-json";
import type { EngineeringAnalyticsDto } from "@/modules/analytics/engineering-analytics.service";
import type { MetricResult } from "@/modules/analytics/metric-result";

const n = (v: number) => new Intl.NumberFormat().format(v);
const EARLIEST = "1900-01-01";

const RANGE_OPTIONS = [
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "365d", label: "Last 365 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
];

const DOMAIN_COLOR: Record<string, keyof ChartPalette> = {
  projects: "brand",
  milestones: "success",
  evidence: "warning",
  goals: "danger",
  architecture: "neutral",
  experiments: "brand",
  certifications: "success",
};

function href(path: string, params: Record<string, string | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
  const q = search.toString();
  return q ? `${path}?${q}` : path;
}

/** Each domain bucket → that domain's records dated in the period (reconciles with the metric). */
function domainHref(key: string, period: EngineeringAnalyticsDto["period"], today: string): string {
  const from = period.from ?? EARLIEST;
  const to = period.to ?? today;
  switch (key) {
    case "projects":
      return href("/projects", { completedFrom: from, completedTo: to });
    case "milestones":
      return href("/projects/milestones", {
        completedFrom: from,
        completedTo: to,
        sort: "-completedAt",
      });
    case "evidence":
      return href("/evidence", { dateFrom: from, dateTo: to });
    case "goals":
      return href("/goals", { completedFrom: from, completedTo: to });
    case "architecture":
      return href("/architecture", { decidedFrom: from, decidedTo: to });
    case "experiments":
      // Experiment runs have no dated list filter — link to the AI Lab list (not period-filtered).
      return "/ai-lab";
    case "certifications":
      // Certifications have no dated list filter — link to the certifications list.
      return "/certifications";
    default:
      return "/analytics";
  }
}

function Meta({ data, metric }: { data: EngineeringAnalyticsDto; metric: MetricResult }) {
  return (
    <>
      {[
        `Period: ${data.period.label}`,
        `Source: ${metric.source.join(", ")}`,
        `Calculated ${new Date(data.calculatedAt).toLocaleTimeString()}`,
      ].join(" · ")}
    </>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="p-4 text-muted-foreground">{children}</div>;
}

function RangeFilter() {
  const { get, set } = useUrlState();
  const id = useId();
  const fromId = useId();
  const toId = useId();
  const range = get("range") || "365d";
  return (
    <section
      aria-label="Engineering analytics filters"
      className="mb-5 flex flex-wrap items-end gap-2 rounded-lg border bg-surface p-3"
    >
      <div className="flex min-w-36 flex-col gap-1">
        <label htmlFor={id} className="text-caption text-muted-foreground">
          Date range
        </label>
        <NativeSelect
          id={id}
          value={range}
          onChange={(e) =>
            set(
              e.target.value === "custom"
                ? { range: "custom" }
                : {
                    range: e.target.value === "365d" ? null : e.target.value,
                    from: null,
                    to: null,
                  },
            )
          }
        >
          {RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {range === "custom" && (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor={fromId} className="text-caption text-muted-foreground">
              From
            </label>
            <Input
              id={fromId}
              type="date"
              value={get("from")}
              onChange={(e) => set({ from: e.target.value || null })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={toId} className="text-caption text-muted-foreground">
              To
            </label>
            <Input
              id={toId}
              type="date"
              value={get("to")}
              onChange={(e) => set({ to: e.target.value || null })}
            />
          </div>
        </>
      )}
      <p className="max-w-prose text-caption text-muted-foreground">
        Counts dated engineering events in the period — recorded output, never time spent. Undated
        records are never counted.
      </p>
    </section>
  );
}

function TrendCard({ data }: { data: EngineeringAnalyticsDto }) {
  const showDefinition = useShowDefinition();
  const metric = data.trend;
  const points = metric.breakdown ?? [];
  const total = points.reduce((s, p) => s + p.value, 0);
  const hasData = metric.state === "ok" || (metric.state === "zero" && points.length > 0);
  return (
    <ChartCard
      title="Engineering activity trend"
      interpretation={
        hasData
          ? `${n(total)} dated engineering events (${data.period.label.toLowerCase()}).`
          : null
      }
      meta={<Meta data={data} metric={metric} />}
      onShowDefinition={() => showDefinition(metric.key)}
      csvName="engineering-activity-trend"
      table={
        hasData
          ? {
              caption: "Engineering activity trend",
              columns: ["Events"],
              rows: points.map((p) => ({ label: p.label, values: [p.value], href: null })),
            }
          : null
      }
      empty={
        hasData ? undefined : <Empty>{metric.stateReason ?? "No dated events in range."}</Empty>
      }
    >
      <EChart
        dataKey={JSON.stringify(points)}
        height={200}
        ariaLabel={`Bar chart of engineering events per month, ${data.period.label}: ${n(total)} in total.`}
        option={(p) => ({
          grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
          tooltip: { trigger: "axis" },
          xAxis: {
            type: "category",
            data: points.map((x) => x.label),
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
              name: "Events",
              type: "bar",
              data: points.map((x) => x.value),
              itemStyle: { color: p.brand },
            },
          ],
        })}
      />
      {metric.truncated && (
        <p className="text-caption text-muted-foreground">Showing the latest 120 months.</p>
      )}
    </ChartCard>
  );
}

function FocusCard({ data }: { data: EngineeringAnalyticsDto }) {
  const router = useRouter();
  const showDefinition = useShowDefinition();
  const metric = data.byDomain;
  const buckets = metric.breakdown ?? [];
  const hasData = metric.state === "ok";
  const today = data.evaluatedOn ?? new Date().toISOString().slice(0, 10);
  const hrefFor = (key: string) => domainHref(key, data.period, today);
  return (
    <ChartCard
      title="Engineering activity by domain"
      interpretation={
        hasData
          ? `Where your recorded engineering output went in ${data.period.label.toLowerCase()}.`
          : null
      }
      meta={<Meta data={data} metric={metric} />}
      onShowDefinition={() => showDefinition(metric.key)}
      csvName="engineering-activity-by-domain"
      table={hasData ? distributionTable(metric, hrefFor) : null}
      empty={
        hasData ? undefined : (
          <Empty>{metric.stateReason ?? "No dated engineering events in range."}</Empty>
        )
      }
    >
      <EChart
        dataKey={JSON.stringify(buckets)}
        height={Math.max(160, buckets.length * 34)}
        ariaLabel={`Bar chart of engineering activity by domain: ${buckets.map((b) => `${b.label} ${b.value}`).join(", ")}.`}
        option={distributionOption(buckets, (p, key) => p[DOMAIN_COLOR[key] ?? "neutral"])}
        onSelect={(i) => {
          const b = buckets[i];
          if (b) router.push(hrefFor(b.key) as never);
        }}
      />
    </ChartCard>
  );
}

function Integrations({ data }: { data: EngineeringAnalyticsDto }) {
  return (
    <section aria-labelledby="eng-integrations" className="rounded-lg border bg-surface">
      <header className="border-b px-4 py-3">
        <h2 id="eng-integrations" className="text-h3 font-semibold">
          Integration metrics (unavailable)
        </h2>
        <p className="mt-0.5 max-w-prose text-caption text-muted-foreground">
          DORA and technical-debt metrics need a CI/CD, version-control or issue-tracking
          integration, which PEOS does not have. Per the analytics spec, PEOS never fabricates a
          metric when its data source is unavailable — these are shown with their source and the
          reason they cannot be computed.
        </p>
      </header>
      <ul className="divide-y">
        {data.integrations.map((m) => (
          <li key={m.key} className="flex flex-col gap-0.5 px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{m.name}</span>
              <span className="text-caption text-muted-foreground">Not available</span>
            </div>
            <p className="text-caption text-muted-foreground">{m.definition}</p>
            <p className="text-caption text-muted-foreground">
              Source: {m.source.join(", ")} · {m.reason}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

const DOMAIN_LINKS = [
  { href: "/projects/portfolio", label: "Project analytics" },
  { href: "/skills/intelligence", label: "Skill analytics" },
  { href: "/goals/analytics", label: "Goal analytics" },
  { href: "/evidence", label: "Evidence" },
  { href: "/architecture/analytics", label: "Architecture analytics" },
  { href: "/ai-lab/analytics", label: "AI Lab analytics" },
];

function EngineeringBody() {
  const { get } = useUrlState();
  const range = get("range") || "365d";
  const from = get("from");
  const to = get("to");
  const incomplete = range === "custom" && (!from || !to);
  const params = { range, from: from || undefined, to: to || undefined };
  const query = useApiGet<{ data: EngineeringAnalyticsDto }>(
    ["analytics", "engineering", params],
    withQuery("/api/v1/analytics/engineering", params),
    !incomplete,
  );

  if (incomplete)
    return <p className="text-muted-foreground">Choose both dates of the custom range.</p>;
  if (query.isPending) return <ListSkeleton rows={6} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const data = query.data.data;
  const anyRecords = Object.values(data.recordCounts).some((v) => v > 0);

  return (
    <>
      <RangeFilter />
      {!anyRecords ? (
        <div className="rounded-lg border bg-surface p-6">
          <h2 className="text-h3 font-semibold">No engineering records yet.</h2>
          <p className="mt-1 max-w-prose text-muted-foreground">
            Engineering analytics appear once you record projects, milestones, evidence, goals,
            architecture decisions, experiment runs or certifications. Nothing is estimated.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <section aria-labelledby="eng-kpis">
            <h2 id="eng-kpis" className="sr-only">
              Engineering activity
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              <KpiCard metric={data.activity} href={null} detail={data.period.label} />
            </div>
          </section>
          <div className="grid gap-4 xl:grid-cols-2">
            <TrendCard data={data} />
            <FocusCard data={data} />
          </div>
          <Integrations data={data} />
          <nav aria-label="Domain analytics" className="flex flex-wrap gap-x-4 gap-y-1">
            <span className="text-caption text-muted-foreground">Drill into a domain:</span>
            {DOMAIN_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href as never}
                className="text-caption underline underline-offset-4"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/command-center/metrics"
              className="text-caption underline underline-offset-4"
            >
              Metric catalogue
            </Link>
          </nav>
        </div>
      )}
    </>
  );
}

export function EngineeringAnalyticsView() {
  return (
    <MetricDefinitionProvider>
      <EngineeringBody />
    </MetricDefinitionProvider>
  );
}
