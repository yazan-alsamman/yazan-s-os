"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { ChartCard } from "@/components/charts/chart-card";
import { EChart, type ChartPalette } from "@/components/charts/echart";
import { bucketHref } from "@/components/command-center/drilldown";
import { useShowDefinition } from "@/components/command-center/metric-definition";
import { distributionOption, distributionTable } from "@/components/command-center/sections";
import { ErrorState } from "@/components/data/states";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { ApiError, errorMessage } from "@/lib/http/fetch-json";
import type { MetricResult } from "@/modules/analytics/metric-result";

import { useGithubRepos, useGithubSync, useGithubSyncStatus } from "./use-github";

export const GITHUB_RANGES = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "180d", label: "180 days" },
  { value: "365d", label: "365 days" },
  { value: "all", label: "All time" },
];

export function GithubNotConnected() {
  return (
    <div className="rounded-lg border border-dashed bg-surface p-6 text-center">
      <h2 className="text-h3 font-semibold">GitHub is not connected.</h2>
      <p className="mx-auto mt-1 max-w-prose text-muted-foreground">
        Connect GitHub to load your repositories and analytics. No data is shown until you connect.
      </p>
      <Button asChild size="sm" className="mt-3">
        <Link href="/settings/integrations">Connect GitHub</Link>
      </Button>
    </div>
  );
}

/** Right state for a GitHub query error, or null to render content. */
export function GithubError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}): ReactNode {
  if (error instanceof ApiError && error.body?.code === "INTEGRATION_NOT_CONNECTED") {
    return <GithubNotConnected />;
  }
  if (error instanceof ApiError && error.body?.code === "INTEGRATION_RATE_LIMITED") {
    return (
      <p role="alert" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
        GitHub is rate-limiting requests. Try again shortly; your last synchronized data is kept.
      </p>
    );
  }
  return <ErrorState error={error} onRetry={onRetry} />;
}

export function PeriodSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <NativeSelect aria-label="Time period" value={value} onChange={(e) => onChange(e.target.value)}>
      {GITHUB_RANGES.map((r) => (
        <option key={r.value} value={r.value}>
          {r.label}
        </option>
      ))}
    </NativeSelect>
  );
}

export function SyncButton({ lastSyncedAt }: { lastSyncedAt: string | null }) {
  const sync = useGithubSync();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
        {sync.isPending ? "Syncing…" : "Sync GitHub"}
      </Button>
      <span className="text-caption text-muted-foreground">
        {lastSyncedAt
          ? `Last synchronized ${new Date(lastSyncedAt).toLocaleString()}`
          : "Not synchronized yet"}
      </span>
      {sync.isError && (
        <span role="alert" className="text-caption text-danger">
          {errorMessage(sync.error)}
        </span>
      )}
    </div>
  );
}

export function Freshness({ lastSyncedAt }: { lastSyncedAt: string | null }) {
  return (
    <p className="text-caption text-muted-foreground">
      Source: GitHub ·{" "}
      {lastSyncedAt
        ? `last synchronized ${new Date(lastSyncedAt).toLocaleString()}`
        : "not synchronized"}
    </p>
  );
}

/**
 * Only ever hand an http(s) URL to an anchor. GitHub content is untrusted; this blocks
 * `javascript:`/`data:` and other schemes from reaching the DOM (defence in depth; ADR 0055).
 */
export function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** A link to external GitHub content that is inert unless the URL is a safe http(s) URL. */
export function ExternalLink({ url, children }: { url: string | null; children: ReactNode }) {
  const href = safeUrl(url);
  if (!href) return <span>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">
      {children}
    </a>
  );
}

/** Short, locale date for a nullable ISO timestamp. */
export const shortDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

/** Percentage / hours formatters for ratio & duration KPIs. */
export const asPercent = (v: number) => `${Math.round(v * 1000) / 10}%`;
export const asHours = (v: number) =>
  v >= 48 ? `${Math.round(v / 24)}d` : `${Math.round(v * 10) / 10}h`;

/** "All repositories" + one option per synced repository (filters analytics to a single repo). */
export function RepoFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (externalId: string) => void;
}) {
  const q = useGithubRepos({ pageSize: 100, sort: "pushed" });
  const repos = q.data?.data ?? [];
  return (
    <NativeSelect
      aria-label="Repository"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={q.isPending || repos.length === 0}
    >
      <option value="">All repositories</option>
      {repos.map((r) => (
        <option key={r.externalId} value={r.externalId}>
          {r.fullName}
        </option>
      ))}
    </NativeSelect>
  );
}

/** Standard GitHub analytics toolbar: period, optional repository filter, extra controls, sync. */
export function GhToolbar({
  range,
  onRange,
  repo,
  onRepo,
  extra,
}: {
  range: string;
  onRange: (v: string) => void;
  repo?: string;
  onRepo?: (externalId: string) => void;
  extra?: ReactNode;
}) {
  const status = useGithubSyncStatus();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-caption text-muted-foreground">Period</span>
        <PeriodSelect value={range} onChange={onRange} />
        {onRepo ? (
          <>
            <span className="text-caption text-muted-foreground">Repository</span>
            <RepoFilter value={repo ?? ""} onChange={onRepo} />
          </>
        ) : null}
        {extra}
      </div>
      <SyncButton lastSyncedAt={status.data?.connection.lastSyncAt ?? null} />
    </div>
  );
}

const COMPLETENESS_LABEL: Record<string, { label: string; tone: "ok" | "warn" | "danger" }> = {
  complete: { label: "Complete", tone: "ok" },
  partial: { label: "Partially synchronized", tone: "warn" },
  running: { label: "Synchronizing…", tone: "warn" },
  error: { label: "Synchronization error", tone: "danger" },
  not_synchronized: { label: "Not synchronized", tone: "warn" },
};

/**
 * One-line synchronization banner (Phase 9.7). Partial, running, error and not-synchronized states
 * are always visible — partial data is never silently presented as complete. Renders nothing while
 * complete so clean pages stay uncluttered.
 */
export function SyncStatusBanner() {
  const q = useGithubSyncStatus();
  if (q.isPending || q.isError || !q.data) return null;
  const { completeness, connection } = q.data;
  if (completeness === "complete") return null;
  const meta = COMPLETENESS_LABEL[completeness] ?? { label: completeness, tone: "warn" as const };
  const tone =
    meta.tone === "danger"
      ? "border-danger/40 bg-danger/10"
      : meta.tone === "warn"
        ? "border-warning/40 bg-warning/10"
        : "border-success/40 bg-success/10";
  const detail =
    completeness === "partial"
      ? "Some repositories are still pending (rate limits or per-run budget). Re-run Sync to continue — analytics reflect only synchronized data."
      : completeness === "not_synchronized"
        ? "Run Sync to load pull requests, issues, releases, contributors and activity."
        : completeness === "running"
          ? "A synchronization run is in progress."
          : "The last synchronization reported errors. Re-run Sync; your last synchronized data is kept.";
  return (
    <div role="status" className={`rounded-md border px-3 py-2 text-caption ${tone}`}>
      <span className="font-medium">{meta.label}.</span> {detail}
      {connection.lastSyncAt && (
        <span className="text-muted-foreground">
          {" "}
          Last synchronized {new Date(connection.lastSyncAt).toLocaleString()}.
        </span>
      )}
    </div>
  );
}

const RESOURCE_LABEL: Record<string, string> = {
  repository: "Repositories",
  github_commit: "Commits",
  github_pull_request: "Pull requests",
  github_issue: "Issues",
  github_release: "Releases",
  github_contributor: "Contributors",
};
const STATUS_TONE: Record<string, string> = {
  success: "text-success",
  partial: "text-warning",
  running: "text-warning",
  failed: "text-danger",
  idle: "text-muted-foreground",
};

/** Per-resource synchronization detail table (status, counts, pending repositories, errors). */
export function SyncStatusPanel() {
  const q = useGithubSyncStatus();
  if (q.isPending) return null;
  if (q.isError) return null;
  const data = q.data;
  if (!data || data.resources.length === 0) {
    return (
      <p className="rounded-md border bg-surface px-3 py-2 text-caption text-muted-foreground">
        Not synchronized yet — run Sync to populate GitHub intelligence.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border bg-surface">
      <table className="w-full text-caption">
        <caption className="sr-only">Synchronization status by resource type</caption>
        <thead className="text-muted-foreground">
          <tr className="border-b text-left">
            <th scope="col" className="px-3 py-2 font-medium">
              Resource
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Status
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Records
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Pending repos
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Completed
            </th>
          </tr>
        </thead>
        <tbody>
          {data.resources.map((r) => (
            <tr key={r.resourceType} className="border-b last:border-0">
              <th scope="row" className="px-3 py-2 text-left font-normal">
                {RESOURCE_LABEL[r.resourceType] ?? r.resourceType}
              </th>
              <td className={`px-3 py-2 ${STATUS_TONE[r.status] ?? ""}`}>
                {r.status}
                {r.lastError && (
                  <span className="block text-danger" title={r.lastError}>
                    {r.lastError}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular">{r.recordsFetched}</td>
              <td className="px-3 py-2 text-right tabular">
                {r.pendingRepositories === null
                  ? "—"
                  : `${r.pendingRepositories}${r.totalRepositories ? ` / ${r.totalRepositories}` : ""}`}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {r.completedAt ? new Date(r.completedAt).toLocaleString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between gap-2 px-1 py-2 text-caption text-muted-foreground">
      <span>
        {total} total · page {page} of {totalPages}
      </span>
      <div className="flex gap-1">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

/** GitHub product-area sub-navigation (Phase 9.7). */
const GH_TABS = [
  { href: "/github", label: "Overview" },
  { href: "/github/repositories", label: "Repositories" },
  { href: "/github/activity", label: "Activity" },
  { href: "/github/pull-requests", label: "Pull Requests" },
  { href: "/github/issues", label: "Issues" },
  { href: "/github/releases", label: "Releases" },
  { href: "/github/contributors", label: "Contributors" },
  { href: "/github/analytics", label: "Analytics" },
  { href: "/github/compare", label: "Compare" },
  { href: "/settings/integrations", label: "Connection" },
] as const;

export function GithubNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/github" ? pathname === "/github" : pathname.startsWith(href);
  return (
    <nav aria-label="GitHub sections" className="flex flex-wrap gap-1 border-b pb-2">
      {GH_TABS.map((t) => {
        const active = isActive(t.href);
        return (
          <Link
            key={t.href}
            href={t.href as never}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-2.5 py-1 text-caption ${
              active
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-surface-sunken"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** A governed distribution as a horizontal/vertical bar chart with a table alternative + drill-down. */
export function DistributionCard({
  metric,
  title,
  horizontal = true,
  filters = {},
  colors,
}: {
  metric: MetricResult;
  title: string;
  horizontal?: boolean;
  filters?: Record<string, string>;
  colors?: (p: ChartPalette, key: string) => string;
}) {
  const router = useRouter();
  const showDefinition = useShowDefinition();
  const buckets = metric.breakdown ?? [];
  const hrefFor = (key: string) => bucketHref(metric.key, key, filters as never);
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
              {
                type: "bar",
                data: buckets.map((b) => b.value),
                itemStyle: { color: color(p, "") },
              },
            ],
          })}
        />
      )}
    </ChartCard>
  );
}

/** A governed period distribution as a line/area trend with a table alternative. */
export function TrendCard({ metric, title }: { metric: MetricResult; title: string }) {
  const showDefinition = useShowDefinition();
  const buckets = metric.breakdown ?? [];
  const hasData = metric.state === "ok";
  return (
    <ChartCard
      title={title}
      interpretation={null}
      meta={`Source: ${metric.source.join(", ")}`}
      onShowDefinition={() => showDefinition(metric.key)}
      csvName={title.toLowerCase().replace(/\s+/g, "-")}
      table={hasData ? distributionTable(metric, () => null) : null}
      empty={
        hasData ? undefined : (
          <div className="p-4 text-muted-foreground">{metric.stateReason ?? "No data."}</div>
        )
      }
    >
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
            {
              type: "line",
              smooth: true,
              areaStyle: { opacity: 0.12 },
              data: buckets.map((b) => b.value),
              itemStyle: { color: p.brand },
              lineStyle: { color: p.brand },
            },
          ],
        })}
      />
    </ChartCard>
  );
}

/**
 * Accessible daily-commit heatmap (Phase 9.7). The metric is explicit — daily commit count in UTC,
 * never a blended activity score. Keyboard-navigable cells + a full data-table alternative.
 */
export function Heatmap({ metric, max }: { metric: MetricResult; max: number }) {
  const showDefinition = useShowDefinition();
  const cells = metric.breakdown ?? [];
  const hasData = metric.state === "ok" && cells.length > 0;
  const level = (v: number) => (v === 0 ? 0 : max <= 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
  const bg = ["bg-surface-sunken", "bg-brand/20", "bg-brand/40", "bg-brand/60", "bg-brand/90"];
  return (
    <ChartCard
      title="Daily commit heatmap"
      interpretation="Daily commit count (UTC). Commits only — pull requests, issues and releases are not blended in."
      meta={`Source: ${metric.source.join(", ")}`}
      onShowDefinition={() => showDefinition(metric.key)}
      csvName="daily-commit-heatmap"
      table={hasData ? distributionTable(metric, () => null) : null}
      empty={
        hasData ? undefined : (
          <div className="p-4 text-muted-foreground">
            {metric.stateReason ?? "No commit activity in this period."}
          </div>
        )
      }
    >
      <ul className="flex flex-wrap gap-1 p-3" aria-label="Daily commit counts">
        {cells.map((c) => (
          <li key={c.key}>
            <span
              tabIndex={0}
              role="img"
              aria-label={`${c.label}: ${c.value} commit${c.value === 1 ? "" : "s"}`}
              title={`${c.label}: ${c.value}`}
              className={`block size-3.5 rounded-sm ${bg[level(c.value)]} focus:ring-2 focus:ring-ring focus:outline-none`}
            />
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}
