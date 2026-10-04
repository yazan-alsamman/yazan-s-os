"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ChartCard } from "@/components/charts/chart-card";
import { EChart, type ChartPalette } from "@/components/charts/echart";
import { bucketHref } from "@/components/command-center/drilldown";
import { KpiCard } from "@/components/command-center/kpi-card";
import {
  MetricDefinitionProvider,
  useShowDefinition,
} from "@/components/command-center/metric-definition";
import { distributionOption, distributionTable } from "@/components/command-center/sections";
import { ListSkeleton } from "@/components/data/states";
import type { MetricResult } from "@/modules/analytics/metric-result";

import { Freshness, GithubError, PeriodSelect, SyncButton } from "./common";
import { useGithubOverview } from "./use-github";

const n = (v: number) => new Intl.NumberFormat().format(v);

function Distribution({
  metric,
  title,
  colors,
}: {
  metric: MetricResult;
  title: string;
  colors: (p: ChartPalette, key: string) => string;
}) {
  const router = useRouter();
  const showDefinition = useShowDefinition();
  const buckets = metric.breakdown ?? [];
  const hrefFor = (key: string) => bucketHref(metric.key, key, {});
  const hasData = metric.state === "ok";
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
      <EChart
        dataKey={JSON.stringify(buckets)}
        height={Math.max(120, buckets.length * 32)}
        ariaLabel={`${title}: ${buckets.map((b) => `${b.label} ${b.value}`).join(", ")}`}
        option={distributionOption(buckets, colors)}
        onSelect={(i) => {
          const t = buckets[i] && hrefFor(buckets[i]!.key);
          if (t) router.push(t as never);
        }}
      />
    </ChartCard>
  );
}

function Body() {
  const [range, setRange] = useState("90d");
  const q = useGithubOverview(range);
  if (q.isError) return <GithubError error={q.error} onRetry={() => void q.refetch()} />;
  if (q.isPending) return <ListSkeleton rows={6} />;
  const d = q.data;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-surface p-3">
        <div className="flex items-center gap-2">
          <span className="text-caption text-muted-foreground">Period</span>
          <PeriodSelect value={range} onChange={setRange} />
        </div>
        <SyncButton lastSyncedAt={d.lastSyncedAt} />
      </div>

      {!d.synced ? (
        <div className="rounded-lg border bg-surface p-6">
          <h2 className="text-h3 font-semibold">GitHub connected — not synchronized yet.</h2>
          <p className="mt-1 max-w-prose text-muted-foreground">
            Run <b>Sync GitHub</b> to load your repositories and recent commits. Nothing is
            estimated; analytics appear only from synchronized data.
          </p>
        </div>
      ) : (
        <>
          <section aria-labelledby="gh-kpis">
            <h2 id="gh-kpis" className="sr-only">
              GitHub indicators
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <KpiCard metric={d.repositories.total} href="/github/repositories" />
              <KpiCard
                metric={d.repositories.active}
                href="/github/repositories?activity=recent"
                detail={d.period.label}
              />
              <KpiCard metric={d.commits.total} href="/github/analytics" detail={d.period.label} />
              <KpiCard
                metric={d.commits.activeDays}
                href="/github/analytics"
                detail={d.period.label}
              />
              <div className="rounded-lg border bg-surface p-3">
                <p className="text-caption text-muted-foreground">Avg commits / active day</p>
                <p className="text-h2 font-semibold tabular">
                  {d.commits.avgPerActiveDay === null ? "—" : n(d.commits.avgPerActiveDay)}
                </p>
                <p className="text-caption text-muted-foreground">
                  {d.commits.activeRepos} active repos
                </p>
              </div>
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <Distribution
              metric={d.repositories.byVisibility}
              title="Repositories by visibility"
              colors={(p, k) => (k === "private" ? p.warning : p.neutral)}
            />
            <Distribution
              metric={d.repositories.byType}
              title="Repositories by type"
              colors={(p, k) => (k === "fork" ? p.neutral : p.brand)}
            />
          </div>

          <Freshness lastSyncedAt={d.lastSyncedAt} />
        </>
      )}

      <nav aria-label="GitHub sections" className="flex flex-wrap gap-x-4 gap-y-1">
        <span className="text-caption text-muted-foreground">Explore:</span>
        <Link href="/github/repositories" className="text-caption underline underline-offset-4">
          Repositories
        </Link>
        <Link href="/github/analytics" className="text-caption underline underline-offset-4">
          Analytics
        </Link>
        <Link href="/command-center/metrics" className="text-caption underline underline-offset-4">
          Metric catalogue
        </Link>
        <Link href="/settings/integrations" className="text-caption underline underline-offset-4">
          Connection
        </Link>
      </nav>
    </div>
  );
}

export function GitHubOverview() {
  return (
    <MetricDefinitionProvider>
      <Body />
    </MetricDefinitionProvider>
  );
}
