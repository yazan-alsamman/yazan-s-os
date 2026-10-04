"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ChartCard } from "@/components/charts/chart-card";
import { EChart, type ChartPalette } from "@/components/charts/echart";
import { bucketHref } from "@/components/command-center/drilldown";
import {
  MetricDefinitionProvider,
  useShowDefinition,
} from "@/components/command-center/metric-definition";
import { distributionOption, distributionTable } from "@/components/command-center/sections";
import { formatDate } from "@/components/data/detail";
import { ListSkeleton } from "@/components/data/states";
import type { MetricResult } from "@/modules/analytics/metric-result";

import { Freshness, GithubError, PeriodSelect } from "./common";
import { useGithubAnalytics } from "./use-github";

const n = (v: number) => new Intl.NumberFormat().format(v);

function Dist({
  metric,
  title,
  horizontal = true,
  colors,
}: {
  metric: MetricResult;
  title: string;
  horizontal?: boolean;
  colors?: (p: ChartPalette, key: string) => string;
}) {
  const router = useRouter();
  const showDefinition = useShowDefinition();
  const buckets = metric.breakdown ?? [];
  const hrefFor = (key: string) => bucketHref(metric.key, key, {});
  const hasData = metric.state === "ok";
  const color = colors ?? ((p: ChartPalette) => p.brand);
  return (
    <ChartCard
      title={title}
      interpretation={null}
      meta={`Source: ${metric.source.join(", ")}`}
      onShowDefinition={() => showDefinition(metric.key)}
      csvName={title.toLowerCase().replace(/\s+/g, "-")}
      table={hasData ? distributionTable(metric, hrefFor) : null}
      empty={
        hasData ? undefined : (
          <div className="p-4 text-muted-foreground">{metric.stateReason ?? "No data."}</div>
        )
      }
    >
      {horizontal ? (
        <EChart
          dataKey={JSON.stringify(buckets)}
          height={Math.max(140, buckets.length * 30)}
          ariaLabel={`${title}: ${buckets.map((b) => `${b.label} ${b.value}`).join(", ")}`}
          option={distributionOption(buckets, color)}
          onSelect={(i) => {
            const t = buckets[i] && hrefFor(buckets[i]!.key);
            if (t) router.push(t as never);
          }}
        />
      ) : (
        <EChart
          dataKey={JSON.stringify(buckets)}
          height={220}
          ariaLabel={`${title}: ${buckets.map((b) => `${b.label} ${b.value}`).join(", ")}`}
          option={(p) => ({
            grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
            tooltip: { trigger: "axis" },
            xAxis: {
              type: "category",
              data: buckets.map((b) => b.label),
              axisLabel: { color: p.mutedText },
            },
            yAxis: {
              type: "value",
              minInterval: 1,
              axisLabel: { color: p.mutedText },
              splitLine: { lineStyle: { color: p.grid } },
            },
            series: [
              { type: "bar", data: buckets.map((b) => b.value), itemStyle: { color: p.brand } },
            ],
          })}
        />
      )}
    </ChartCard>
  );
}

function Ranking({
  title,
  items,
}: {
  title: string;
  items: { fullName: string; value?: number; lastActivity?: string; externalId: string }[];
}) {
  return (
    <section aria-labelledby={`rank-${title}`} className="rounded-lg border bg-surface">
      <header className="border-b px-4 py-3">
        <h3 id={`rank-${title}`} className="text-h3 font-semibold">
          {title}
        </h3>
      </header>
      {items.length === 0 ? (
        <p className="p-4 text-caption text-muted-foreground">No data.</p>
      ) : (
        <ul className="divide-y">
          {items.map((it) => (
            <li
              key={it.externalId}
              className="flex items-center justify-between gap-2 px-4 py-2 text-caption"
            >
              <Link
                href={`/github/repositories/${it.externalId}`}
                className="truncate hover:underline"
              >
                {it.fullName}
              </Link>
              <span className="shrink-0 text-muted-foreground tabular">
                {it.value !== undefined
                  ? `${n(it.value)} commits`
                  : it.lastActivity
                    ? formatDate(it.lastActivity)
                    : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Body() {
  const [range, setRange] = useState("90d");
  const q = useGithubAnalytics(range);
  if (q.isError) return <GithubError error={q.error} onRetry={() => void q.refetch()} />;
  if (q.isPending) return <ListSkeleton rows={6} />;
  const d = q.data;

  if (!d.synced) {
    return (
      <div className="rounded-lg border bg-surface p-6">
        <h2 className="text-h3 font-semibold">Not synchronized yet.</h2>
        <p className="mt-1 text-muted-foreground">
          Run Sync GitHub from the Overview to load analytics.
        </p>
        <Link href="/github" className="mt-2 inline-block underline underline-offset-4">
          Go to GitHub overview
        </Link>
      </div>
    );
  }

  const trend = d.commitTrend.breakdown ?? [];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2 rounded-lg border bg-surface p-3">
        <span className="text-caption text-muted-foreground">Period</span>
        <PeriodSelect value={range} onChange={setRange} />
      </div>

      <ChartCard
        title="Commit trend"
        interpretation={`${n(trend.reduce((s, b) => s + b.value, 0))} commits (${d.period.label.toLowerCase()}).`}
        meta={`Source: ${d.commitTrend.source.join(", ")}`}
        csvName="github-commit-trend"
        table={
          d.commitTrend.state === "ok"
            ? {
                caption: "Commit trend",
                columns: ["Commits"],
                rows: trend.map((p) => ({ label: p.label, values: [p.value], href: null })),
              }
            : null
        }
        empty={
          d.commitTrend.state === "ok" ? undefined : (
            <div className="p-4 text-muted-foreground">
              {d.commitTrend.stateReason ?? "No commits in range."}
            </div>
          )
        }
      >
        <EChart
          dataKey={JSON.stringify(trend)}
          height={220}
          ariaLabel={`Commit trend: ${trend.map((p) => `${p.label} ${p.value}`).join(", ")}`}
          option={(p) => ({
            grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
            tooltip: { trigger: "axis" },
            xAxis: {
              type: "category",
              data: trend.map((x) => x.label),
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
                type: "line",
                smooth: true,
                areaStyle: {},
                data: trend.map((x) => x.value),
                itemStyle: { color: p.brand },
              },
            ],
          })}
        />
      </ChartCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <Dist metric={d.commitsByRepository} title="Commits by repository" />
        <Dist metric={d.languageDistribution} title="Repositories by primary language" />
        <Dist
          metric={d.repositoriesByActivity}
          title="Repositories by activity recency"
          colors={(p, k) =>
            k === "active"
              ? p.success
              : k === "idle_30"
                ? p.brand
                : k === "idle_90"
                  ? p.warning
                  : p.neutral
          }
        />
        <Dist
          metric={d.byVisibility}
          title="Repositories by visibility"
          colors={(p, k) => (k === "private" ? p.warning : p.neutral)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Ranking
          title="Most commits"
          items={d.rankings.mostCommits.map((r) => ({
            externalId: r.key,
            fullName: r.label,
            value: r.value,
          }))}
        />
        <Ranking title="Most recently active" items={d.rankings.mostRecent} />
        <Ranking title="No recent activity (90+ days)" items={d.rankings.noRecent} />
      </div>

      <p className="text-caption text-muted-foreground">
        Rankings are separate, transparent observations — never a combined repository score.
        Activity means observed GitHub events, not quality or productivity.
      </p>
      <Freshness lastSyncedAt={null} />
    </div>
  );
}

export function GitHubAnalytics() {
  return (
    <MetricDefinitionProvider>
      <Body />
    </MetricDefinitionProvider>
  );
}
