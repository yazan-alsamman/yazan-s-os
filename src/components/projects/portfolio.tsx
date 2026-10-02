"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, type ReactNode } from "react";

import { ChartCard } from "@/components/charts/chart-card";
import { EChart, type ChartPalette } from "@/components/charts/echart";
import { bucketHref, metricHref } from "@/components/command-center/drilldown";
import { KpiCard } from "@/components/command-center/kpi-card";
import {
  MetricDefinitionProvider,
  useShowDefinition,
} from "@/components/command-center/metric-definition";
import { distributionOption, distributionTable } from "@/components/command-center/sections";
import { formatDate } from "@/components/data/detail";
import { ErrorState, ListSkeleton } from "@/components/data/states";
import { useUrlState } from "@/components/data/use-url-state";
import { labelOf, USAGE_TYPE_OPTIONS } from "@/components/records/options";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useApiGet } from "@/lib/api/hooks";
import { withQuery } from "@/lib/http/fetch-json";
import type { DistributionBucket, MetricResult } from "@/modules/analytics/metric-result";
import type { PortfolioDto } from "@/modules/analytics/portfolio.service";

import { percent } from "./dossier";

const n = (v: number) => new Intl.NumberFormat().format(v);

const RANGE_OPTIONS = [
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "365d", label: "Last 365 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
];

const COMPUTED_COLOR: Record<string, keyof ChartPalette> = {
  good: "success",
  watch: "warning",
  poor: "danger",
  insufficient_data: "neutral",
  not_applicable: "neutral",
};
const MANUAL_COLOR: Record<string, keyof ChartPalette> = {
  on_track: "success",
  at_risk: "warning",
  blocked: "danger",
  not_assessed: "neutral",
};
const USAGE_ORDER = ["core", "supporting", "infrastructure", "tooling", "other"] as const;

/** Month bucket → inclusive day range, clamped to the period (drill-down equals the bar). */
function monthRange(month: string, period: PortfolioDto["period"]) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const start = `${month}-01`;
  const end = `${month}-${String(last).padStart(2, "0")}`;
  return {
    from: period.from && period.from > start ? period.from : start,
    to: period.to && period.to < end ? period.to : end,
  };
}

function Meta({ data, metric }: { data: PortfolioDto; metric: MetricResult }) {
  return (
    <>
      {[
        metric.temporal === "period" ? data.period.label : "Current state",
        `Source: ${metric.source.join(", ")}`,
        `Calculated ${new Date(data.calculatedAt).toLocaleTimeString()}`,
      ].join(" · ")}
    </>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="p-4 text-muted-foreground">{children}</div>;
}

function DistributionChart({
  data,
  metric,
  title,
  interpretation,
  colors,
  hrefFor,
  csvName,
  emptyText,
}: {
  data: PortfolioDto;
  metric: MetricResult;
  title: string;
  interpretation: string | null;
  colors: (p: ChartPalette, key: string) => string;
  hrefFor: (key: string) => string | null;
  csvName: string;
  emptyText: string;
}) {
  const router = useRouter();
  const showDefinition = useShowDefinition();
  const buckets = metric.breakdown ?? [];
  const hasData = metric.state === "ok";
  return (
    <ChartCard
      title={title}
      interpretation={hasData ? interpretation : null}
      meta={<Meta data={data} metric={metric} />}
      onShowDefinition={() => showDefinition(metric.key)}
      csvName={csvName}
      table={hasData ? distributionTable(metric, hrefFor) : null}
      empty={hasData ? undefined : <Empty>{metric.stateReason ?? emptyText}</Empty>}
    >
      <EChart
        dataKey={JSON.stringify(buckets)}
        height={Math.max(140, buckets.length * 30)}
        ariaLabel={`Bar chart of ${title.toLowerCase()}: ${buckets.map((b) => `${b.label} ${b.value}`).join(", ")}.`}
        option={distributionOption(buckets, colors)}
        onSelect={(i) => {
          const target = hrefFor(buckets[i]?.key ?? "");
          if (target) router.push(target as never);
        }}
      />
    </ChartCard>
  );
}

function TrendChart({
  data,
  metric,
  title,
  noun,
  hrefFor,
  csvName,
  truncated,
}: {
  data: PortfolioDto;
  metric: MetricResult;
  title: string;
  noun: string;
  hrefFor: (month: string) => string;
  csvName: string;
  truncated: boolean;
}) {
  const router = useRouter();
  const showDefinition = useShowDefinition();
  const points: DistributionBucket[] = metric.breakdown ?? [];
  const total = points.reduce((s, p) => s + p.value, 0);
  const hasMonths = points.length > 0 && metric.state !== "no_data";
  return (
    <ChartCard
      title={title}
      interpretation={
        hasMonths
          ? `${n(total)} ${total === 1 ? noun.replace(/s$/, "") : noun} completed (${data.period.label.toLowerCase()}).`
          : null
      }
      meta={<Meta data={data} metric={metric} />}
      onShowDefinition={() => showDefinition(metric.key)}
      csvName={csvName}
      table={
        hasMonths
          ? {
              caption: title,
              columns: ["Completed"],
              rows: points.map((p) => ({
                label: p.label,
                values: [p.value],
                href: hrefFor(p.key),
              })),
            }
          : null
      }
      empty={
        hasMonths ? undefined : (
          <Empty>{metric.stateReason ?? `No ${noun} have a completion date in this period.`}</Empty>
        )
      }
    >
      <EChart
        dataKey={JSON.stringify(points)}
        height={200}
        ariaLabel={`Bar chart of ${noun} completed per month, ${data.period.label}: ${n(total)} in total.`}
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
              name: "Completed",
              type: "bar",
              data: points.map((x) => x.value),
              itemStyle: { color: p.brand },
              cursor: "pointer",
            },
          ],
        })}
        onSelect={(i) => {
          const point = points[i];
          if (point && point.value > 0) router.push(hrefFor(point.key) as never);
        }}
      />
      {truncated && (
        <p className="text-caption text-muted-foreground">Showing the latest 120 months.</p>
      )}
    </ChartCard>
  );
}

function RangeFilter() {
  const { get, set } = useUrlState();
  const id = useId();
  const fromId = useId();
  const toId = useId();
  const range = get("range") || "365d";
  return (
    <section
      aria-label="Portfolio filters"
      className="mb-5 flex flex-wrap items-end gap-2 rounded-lg border bg-surface p-3"
    >
      <div className="flex min-w-36 flex-col gap-1">
        <label htmlFor={id} className="text-caption text-muted-foreground">
          Date range (trends)
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
      <p className="text-caption text-muted-foreground">
        The range applies to completion trends and “milestones completed”. Distributions describe
        the current state.
      </p>
    </section>
  );
}

function HealthMatrix({ data }: { data: PortfolioDto }) {
  const showDefinition = useShowDefinition();
  const metric = data.healthComparison;
  if (metric.state !== "ok") return null;
  const cells = new Map((metric.breakdown ?? []).map((b) => [b.key, b.value]));
  const manual = data.manualHealth.breakdown ?? [];
  const computed = data.computedHealth.breakdown ?? [];
  return (
    <section aria-labelledby="matrix-title" className="rounded-lg border bg-surface">
      <header className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 id="matrix-title" className="text-h3 font-semibold">
            Manual vs computed health
          </h2>
          <p className="mt-0.5 text-body">
            How your own assessment and the computed signal line up. Neither is treated as correct.
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            <Meta data={data} metric={metric} />
          </p>
        </div>
        <button
          type="button"
          className="rounded-md p-1 text-caption underline underline-offset-4"
          onClick={() => showDefinition(metric.key)}
        >
          Definition
        </button>
      </header>
      <div
        className="overflow-x-auto p-4"
        role="region"
        aria-label="Manual vs computed table (scrolls horizontally on small screens)"
        tabIndex={0}
      >
        <table className="w-full min-w-[34rem] text-body">
          <caption className="sr-only">
            Projects by manual health (rows) and computed health (columns)
          </caption>
          <thead className="text-caption text-muted-foreground">
            <tr>
              <th scope="col" className="py-1 pr-3 text-left font-medium">
                Manual ↓ / Computed →
              </th>
              {computed.map((c) => (
                <th key={c.key} scope="col" className="py-1 pr-3 text-right font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {manual.map((m) => (
              <tr key={m.key}>
                <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                  {m.label}
                </th>
                {computed.map((c) => {
                  const v = cells.get(`${m.key}|${c.key}`) ?? 0;
                  return (
                    <td key={c.key} className="py-1.5 pr-3 text-right tabular">
                      {v > 0 ? (
                        <Link
                          href={`/projects/health?manual=${m.key}&computed=${c.key}` as never}
                          className="underline underline-offset-4"
                          aria-label={`${v} projects: manual ${m.label}, computed ${c.label}`}
                        >
                          {n(v)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TechnologyCard({ data }: { data: PortfolioDto }) {
  const router = useRouter();
  const showDefinition = useShowDefinition();
  const t = data.technologies;
  const rows = t.rows;
  const hasData = t.state === "ok";
  return (
    <ChartCard
      title="Technology usage across projects"
      interpretation={
        hasData
          ? `${n(t.value ?? 0)} technologies used; ${rows[0]?.name} appears in the most projects (${rows[0]?.total}).`
          : null
      }
      meta={<Meta data={data} metric={t} />}
      onShowDefinition={() => showDefinition(t.key)}
      csvName="technology-usage"
      table={
        hasData
          ? {
              caption: "Projects per technology and usage type",
              columns: ["Projects", ...USAGE_ORDER.map((u) => labelOf(USAGE_TYPE_OPTIONS, u))],
              rows: rows.map((r) => ({
                label: r.name,
                values: [r.total, ...USAGE_ORDER.map((u) => r.byUsage[u] ?? 0)],
                href: bucketHref(t.key, r.id, {}),
              })),
            }
          : null
      }
      empty={hasData ? undefined : <Empty>{t.stateReason}</Empty>}
    >
      <EChart
        dataKey={JSON.stringify(rows)}
        height={Math.max(160, rows.length * 28 + 40)}
        ariaLabel={`Stacked bar chart of projects per technology: ${rows.map((r) => `${r.name} ${r.total}`).join(", ")}.`}
        option={(p) => {
          const longest = Math.max(...rows.map((r) => r.name.length), 4);
          const labelWidth = Math.min(170, Math.ceil(longest * 7.2) + 8);
          const colors = [p.brand, p.success, p.warning, p.neutral, p.danger];
          return {
            grid: { left: labelWidth + 12, right: 24, top: 32, bottom: 24, containLabel: false },
            tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
            legend: { top: 0, type: "scroll", itemGap: 16, textStyle: { color: p.text } },
            xAxis: {
              type: "value",
              minInterval: 1,
              axisLabel: { color: p.mutedText },
              splitLine: { lineStyle: { color: p.grid } },
            },
            yAxis: {
              type: "category",
              inverse: true,
              data: rows.map((r) => r.name),
              axisLabel: { color: p.text, width: labelWidth, overflow: "truncate" },
            },
            // Only usage types that occur, so the legend never lists empty series.
            series: USAGE_ORDER.filter((u) => rows.some((r) => (r.byUsage[u] ?? 0) > 0)).map(
              (u) => ({
                name: labelOf(USAGE_TYPE_OPTIONS, u),
                type: "bar",
                stack: "usage",
                data: rows.map((r) => r.byUsage[u] ?? 0),
                itemStyle: { color: colors[USAGE_ORDER.indexOf(u)] },
                cursor: "pointer",
              }),
            ),
          };
        }}
        onSelect={(i) => {
          const row = rows[i];
          const target = row && bucketHref(t.key, row.id, {});
          if (target) router.push(target as never);
        }}
      />
      {t.other.technologies > 0 && (
        <p className="text-caption text-muted-foreground">
          {n(t.other.technologies)} other technologies ({n(t.other.usages)} project usages) are not
          shown.
        </p>
      )}
    </ChartCard>
  );
}

function AttentionCard({ data }: { data: PortfolioDto }) {
  const { overdueMilestones, poorHealth } = data.attention;
  return (
    <section aria-labelledby="pf-attention" className="rounded-lg border bg-surface">
      <header className="border-b px-4 py-3">
        <h2 id="pf-attention" className="text-h3 font-semibold">
          Needs attention
        </h2>
        <p className="mt-1 text-caption text-muted-foreground">
          Overdue milestones and projects whose computed health is poor. Up to 10 each.
        </p>
      </header>
      {overdueMilestones.length === 0 && poorHealth.length === 0 ? (
        <p className="p-4 text-muted-foreground">Nothing flagged.</p>
      ) : (
        <ul className="divide-y">
          {overdueMilestones.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <Link
                href={`/projects/${m.project.id}#milestones` as never}
                className="min-w-0 font-medium hover:underline"
              >
                {m.title}
                <span className="font-normal text-muted-foreground"> · {m.project.name}</span>
              </Link>
              <Badge tone="danger">Overdue since {formatDate(m.dueDate)}</Badge>
            </li>
          ))}
          {poorHealth.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <Link
                href={`/projects/${p.id}#health` as never}
                className="min-w-0 font-medium hover:underline"
              >
                {p.name}
              </Link>
              <Badge tone="danger">Computed health {p.score}/100</Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PortfolioBody() {
  const { get } = useUrlState();
  const range = get("range") || "365d";
  const from = get("from");
  const to = get("to");
  const incomplete = range === "custom" && (!from || !to);
  const params = { range, from: from || undefined, to: to || undefined };
  const query = useApiGet<{ data: PortfolioDto }>(
    ["projects", "portfolio", params],
    withQuery("/api/v1/analytics/portfolio", params),
    !incomplete,
  );
  if (incomplete)
    return <p className="text-muted-foreground">Choose both dates of the custom range.</p>;
  if (query.isPending) return <ListSkeleton rows={6} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const data = query.data.data;
  const m = data.milestones;
  const rate = m.deliveryRate;
  const periodQuery = (f: string, t: string) => `completedFrom=${f}&completedTo=${t}`;
  const computedBuckets = data.computedHealth.breakdown ?? [];
  const get2 = (key: string) => computedBuckets.find((b) => b.key === key)?.value ?? 0;
  const lifecycle = data.lifecycle.breakdown ?? [];
  const active = lifecycle
    .filter((b) => ["discovery", "architecture", "development", "validation"].includes(b.key))
    .reduce((s, b) => s + b.value, 0);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-caption text-muted-foreground">
        {data.period.label}
        {data.period.from && ` (${data.period.from} – ${data.period.to}, UTC days)`} · Evaluated{" "}
        {formatDate(data.evaluatedOn)} (UTC) · Calculated{" "}
        <time dateTime={data.calculatedAt}>{new Date(data.calculatedAt).toLocaleString()}</time>
      </p>
      {data.recordCounts.projects === 0 && (
        <section
          className="rounded-lg border border-dashed bg-surface p-5"
          aria-labelledby="pf-empty"
        >
          <h2 id="pf-empty" className="text-h2 font-semibold">
            Your portfolio will populate as you add projects
          </h2>
          <p className="mt-1 text-muted-foreground">
            Every chart here is computed from your own projects, milestones, technologies and
            evidence — nothing is estimated or pre-filled.
          </p>
          <Link href="/projects" className="mt-2 inline-block underline underline-offset-4">
            Go to projects
          </Link>
        </section>
      )}

      <section aria-labelledby="pf-kpis">
        <h2 id="pf-kpis" className="sr-only">
          Milestone delivery
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard metric={m.total} href={metricHref(m.total.key, {}, data.period)} />
          <KpiCard
            metric={m.completedInPeriod}
            href={metricHref(m.completedInPeriod.key, {}, data.period)}
          />
          <KpiCard metric={m.overdue} href={metricHref(m.overdue.key, {}, data.period)} />
          <KpiCard metric={m.blocked} href={metricHref(m.blocked.key, {}, data.period)} />
          <KpiCard
            metric={rate}
            href={metricHref(rate.key, {}, data.period)}
            format={percent}
            detail={
              rate.breakdown
                ? `${rate.breakdown[0]!.value} completed of ${rate.breakdown[0]!.value + rate.breakdown[1]!.value} done or past due`
                : null
            }
          />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <DistributionChart
          data={data}
          metric={data.lifecycle}
          title="Projects by lifecycle stage"
          interpretation={`${active} of ${data.lifecycle.value} projects are in an active stage (discovery to validation).`}
          colors={(p) => p.brand}
          hrefFor={(key) => bucketHref(data.lifecycle.key, key, {})}
          csvName="projects-by-lifecycle"
          emptyText="No projects yet."
        />
        <AttentionCard data={data} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DistributionChart
          data={data}
          metric={data.manualHealth}
          title="Manual health"
          interpretation="Your own assessment of each project."
          colors={(p, key) => p[MANUAL_COLOR[key] ?? "neutral"]}
          hrefFor={(key) => bucketHref(data.manualHealth.key, key, {})}
          csvName="manual-health"
          emptyText="No projects yet."
        />
        <DistributionChart
          data={data}
          metric={data.computedHealth}
          title="Computed health"
          interpretation={`${get2("poor")} poor, ${get2("watch")} needs watching, ${get2("good")} good; ${get2("insufficient_data")} with insufficient data.`}
          colors={(p, key) => p[COMPUTED_COLOR[key] ?? "neutral"]}
          hrefFor={(key) => bucketHref(data.computedHealth.key, key, {})}
          csvName="computed-health"
          emptyText="No projects yet."
        />
      </div>
      <HealthMatrix data={data} />

      <div className="grid gap-4 xl:grid-cols-2">
        <TrendChart
          data={data}
          metric={data.deliveryTrend}
          title="Project delivery trend"
          noun="projects"
          truncated={data.deliveryTrend.truncated}
          csvName="project-delivery-trend"
          hrefFor={(month) => {
            const r = monthRange(month, data.period);
            return `/projects?${periodQuery(r.from, r.to)}`;
          }}
        />
        <TrendChart
          data={data}
          metric={m.trend}
          title="Milestone completions"
          noun="milestones"
          truncated={m.trend.truncated}
          csvName="milestone-completions"
          hrefFor={(month) => {
            const r = monthRange(month, data.period);
            return `/projects/milestones?${periodQuery(r.from, r.to)}&sort=-completedAt`;
          }}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <TechnologyCard data={data} />
        <DistributionChart
          data={data}
          metric={data.evidenceCoverage}
          title="Project evidence coverage"
          interpretation={`${data.evidenceCoverage.value ?? 0} of ${data.recordCounts.projects} projects have linked evidence.`}
          colors={(p, key) => (key === "true" ? p.success : p.neutral)}
          hrefFor={(key) => bucketHref(data.evidenceCoverage.key, key, {})}
          csvName="project-evidence-coverage"
          emptyText="No projects yet."
        />
      </div>
      <p className="text-caption text-muted-foreground">
        Not shown, by design: the portfolio matrix (impact × complexity × effort), the technology
        heatmap and blocked time need data PEOS does not record —{" "}
        <Link href="/command-center/metrics" className="underline underline-offset-4">
          see the metric catalogue
        </Link>
        .
      </p>
    </div>
  );
}

export function PortfolioView() {
  return (
    <MetricDefinitionProvider>
      <RangeFilter />
      <PortfolioBody />
    </MetricDefinitionProvider>
  );
}
