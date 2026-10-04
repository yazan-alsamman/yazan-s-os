"use client";

import { useState } from "react";

import { KpiCard } from "@/components/command-center/kpi-card";
import { MetricDefinitionProvider } from "@/components/command-center/metric-definition";
import { ListSkeleton } from "@/components/data/states";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";

import {
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
import { useGithubIssueList, useGithubIssues, type IssueRow } from "./use-github";

function IssueList({ repo }: { repo: string }) {
  const [state, setState] = useState("");
  const [page, setPage] = useState(1);
  const q = useGithubIssueList({ repo: repo || undefined, state: state || undefined, page });
  const rows = q.data?.data ?? [];
  return (
    <section aria-labelledby="issue-list" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="issue-list" className="text-h4 font-semibold">
          Issues
        </h2>
        <NativeSelect
          aria-label="Issue state"
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All states</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </NativeSelect>
      </div>
      {q.isPending ? (
        <ListSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <p className="rounded-md border bg-surface px-3 py-6 text-center text-muted-foreground">
          No issues match this filter.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-surface">
          {rows.map((issue: IssueRow) => (
            <li key={`${issue.repoExternalId}-${issue.number}`} className="flex flex-col gap-1 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={issue.state === "open" ? "info" : "neutral"}>{issue.state}</Badge>
                <ExternalLink url={issue.url}>
                  <span className="font-medium">{issue.title ?? `#${issue.number}`}</span>
                </ExternalLink>
              </div>
              <p className="text-caption text-muted-foreground">
                {issue.repoFullName} #{issue.number} · {issue.author ?? "unknown"} · opened{" "}
                {shortDate(issue.createdDate)}
                {issue.closedDate ? ` · closed ${shortDate(issue.closedDate)}` : ""}
              </p>
              {issue.labels.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {issue.labels.slice(0, 8).map((l) => (
                    <Badge key={l} tone="neutral">
                      {l}
                    </Badge>
                  ))}
                </div>
              )}
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
  const q = useGithubIssues({ range, repo: repo || undefined });

  if (q.isError) return <GithubError error={q.error} onRetry={() => void q.refetch()} />;

  return (
    <div className="flex flex-col gap-5">
      <GhToolbar range={range} onRange={setRange} repo={repo} onRepo={setRepo} />
      <SyncStatusBanner />
      {q.isPending ? (
        <ListSkeleton rows={6} />
      ) : (
        <>
          <section aria-labelledby="issue-kpis">
            <h2 id="issue-kpis" className="sr-only">
              Issue indicators
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <KpiCard metric={q.data.kpis.opened} href={null} detail={q.data.period.label} />
              <KpiCard metric={q.data.kpis.closed} href={null} detail={q.data.period.label} />
              <KpiCard metric={q.data.kpis.open} href={null} />
              <KpiCard metric={q.data.kpis.closureRate} href={null} format={asPercent} />
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <TrendCard metric={q.data.trend} title="Issues opened over time" />
            <DistributionCard metric={q.data.byState} title="Issues by state" horizontal />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <DistributionCard metric={q.data.byRepository} title="Issues by repository" />
            <DistributionCard metric={q.data.labels} title="Top labels" />
          </div>

          <IssueList repo={repo} />
        </>
      )}
    </div>
  );
}

export function GitHubIssues() {
  return (
    <MetricDefinitionProvider>
      <Body />
    </MetricDefinitionProvider>
  );
}
