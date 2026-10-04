"use client";

import { useState } from "react";

import { KpiCard } from "@/components/command-center/kpi-card";
import { MetricDefinitionProvider } from "@/components/command-center/metric-definition";
import { ListSkeleton } from "@/components/data/states";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";

import {
  asHours,
  asPercent,
  DistributionCard,
  ExternalLink,
  GhToolbar,
  GithubError,
  Pager,
  shortDate,
  SyncStatusBanner,
  TrendCard,
} from "./common";
import { GithubEvidenceButton } from "./github-evidence-button";
import {
  useGithubPullRequestList,
  useGithubPullRequests,
  type PullRequestRow,
} from "./use-github";

const STATE_TONE: Record<string, "success" | "info" | "neutral"> = {
  merged: "success",
  open: "info",
  closed: "neutral",
} as const;

function PrList({ repo }: { repo: string }) {
  const [state, setState] = useState("");
  const [page, setPage] = useState(1);
  const q = useGithubPullRequestList({ repo: repo || undefined, state: state || undefined, page });
  const rows = q.data?.data ?? [];
  return (
    <section aria-labelledby="pr-list" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="pr-list" className="text-h4 font-semibold">
          Pull requests
        </h2>
        <NativeSelect
          aria-label="Pull request state"
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All states</option>
          <option value="open">Open</option>
          <option value="merged">Merged</option>
          <option value="closed">Closed (not merged)</option>
        </NativeSelect>
      </div>
      {q.isPending ? (
        <ListSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <p className="rounded-md border bg-surface px-3 py-6 text-center text-muted-foreground">
          No pull requests match this filter.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-surface">
          {rows.map((pr: PullRequestRow) => (
            <li key={`${pr.repoExternalId}-${pr.number}`} className="flex flex-col gap-1 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={STATE_TONE[pr.state] ?? "neutral"}>{pr.state}</Badge>
                {pr.draft && <Badge tone="neutral">draft</Badge>}
                <ExternalLink url={pr.url}>
                  <span className="font-medium">{pr.title ?? `#${pr.number}`}</span>
                </ExternalLink>
              </div>
              <p className="text-caption text-muted-foreground">
                {pr.repoFullName} #{pr.number} · {pr.author ?? "unknown"} · opened{" "}
                {shortDate(pr.createdDate)}
                {pr.mergedDate
                  ? ` · merged ${shortDate(pr.mergedDate)}`
                  : pr.closedDate
                    ? ` · closed ${shortDate(pr.closedDate)}`
                    : ""}
              </p>
              <div>
                <GithubEvidenceButton
                  resourceType="pull_request"
                  repoExternalId={pr.repoExternalId}
                  resourceId={String(pr.number)}
                  label="Save as evidence"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      {q.data && (
        <Pager
          page={q.data.page.page}
          totalPages={q.data.page.totalPages}
          total={q.data.page.total}
          onPage={setPage}
        />
      )}
    </section>
  );
}

function Body() {
  const [range, setRange] = useState("90d");
  const [repo, setRepo] = useState("");
  const q = useGithubPullRequests({ range, repo: repo || undefined });

  if (q.isError) return <GithubError error={q.error} onRetry={() => void q.refetch()} />;

  return (
    <div className="flex flex-col gap-5">
      <GhToolbar range={range} onRange={setRange} repo={repo} onRepo={setRepo} />
      <SyncStatusBanner />
      {q.isPending ? (
        <ListSkeleton rows={6} />
      ) : (
        <>
          <section aria-labelledby="pr-kpis">
            <h2 id="pr-kpis" className="sr-only">
              Pull request indicators
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <KpiCard metric={q.data.kpis.opened} href={null} detail={q.data.period.label} />
              <KpiCard metric={q.data.kpis.merged} href={null} detail={q.data.period.label} />
              <KpiCard metric={q.data.kpis.open} href={null} />
              <KpiCard metric={q.data.kpis.mergeRate} href={null} format={asPercent} />
              <KpiCard metric={q.data.kpis.timeToMerge} href={null} format={asHours} />
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <TrendCard metric={q.data.trend} title="Pull requests opened over time" />
            <DistributionCard metric={q.data.byState} title="Pull requests by state" horizontal />
          </div>
          <DistributionCard metric={q.data.byRepository} title="Pull requests by repository" />

          <PrList repo={repo} />
        </>
      )}
    </div>
  );
}

export function GitHubPullRequests() {
  return (
    <MetricDefinitionProvider>
      <Body />
    </MetricDefinitionProvider>
  );
}
