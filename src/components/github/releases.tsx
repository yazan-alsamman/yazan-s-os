"use client";

import { useState } from "react";

import { KpiCard } from "@/components/command-center/kpi-card";
import { MetricDefinitionProvider } from "@/components/command-center/metric-definition";
import { ListSkeleton } from "@/components/data/states";
import { Badge } from "@/components/ui/badge";

import {
  DistributionCard,
  ExternalLink,
  GhToolbar,
  GithubError,
  Pager,
  shortDate,
  SyncStatusBanner,
  TrendCard,
} from "./common";
import { useGithubReleaseList, useGithubReleases, type ReleaseRow } from "./use-github";

function ReleaseList({ repo }: { repo: string }) {
  const [page, setPage] = useState(1);
  const q = useGithubReleaseList({ repo: repo || undefined, page });
  const rows = q.data?.data ?? [];
  return (
    <section aria-labelledby="release-list" className="flex flex-col gap-2">
      <h2 id="release-list" className="text-h4 font-semibold">
        Releases
      </h2>
      {q.isPending ? (
        <ListSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <p className="rounded-md border bg-surface px-3 py-6 text-center text-muted-foreground">
          No releases synchronized for this scope.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-surface">
          {rows.map((rel: ReleaseRow) => (
            <li
              key={`${rel.repoExternalId}-${rel.tagName}-${rel.publishedDate}`}
              className="flex flex-col gap-1 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                {rel.prerelease ? (
                  <Badge tone="warning">pre-release</Badge>
                ) : (
                  <Badge tone="success">stable</Badge>
                )}
                {rel.draft && <Badge tone="neutral">draft</Badge>}
                <ExternalLink url={rel.url}>
                  <span className="font-medium">{rel.name ?? rel.tagName ?? "release"}</span>
                </ExternalLink>
                {rel.tagName && (
                  <span className="text-caption text-muted-foreground">{rel.tagName}</span>
                )}
              </div>
              <p className="text-caption text-muted-foreground">
                {rel.repoFullName} · {rel.author ?? "unknown"} · published{" "}
                {shortDate(rel.publishedDate)}
              </p>
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
  const [range, setRange] = useState("365d");
  const [repo, setRepo] = useState("");
  const q = useGithubReleases({ range, repo: repo || undefined });

  if (q.isError) return <GithubError error={q.error} onRetry={() => void q.refetch()} />;

  return (
    <div className="flex flex-col gap-5">
      <GhToolbar range={range} onRange={setRange} repo={repo} onRepo={setRepo} />
      <SyncStatusBanner />
      {q.isPending ? (
        <ListSkeleton rows={6} />
      ) : (
        <>
          <section aria-labelledby="release-kpis">
            <h2 id="release-kpis" className="sr-only">
              Release indicators
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <KpiCard metric={q.data.kpis.total} href={null} detail={q.data.period.label} />
              <div className="rounded-lg border bg-surface p-3">
                <p className="text-caption text-muted-foreground">Stable / pre-release</p>
                <p className="text-h2 font-semibold tabular">
                  {q.data.stability.stable} / {q.data.stability.prerelease}
                </p>
                <p className="text-caption text-muted-foreground">{q.data.period.label}</p>
              </div>
              <div className="rounded-lg border bg-surface p-3">
                <p className="text-caption text-muted-foreground">Repositories with releases</p>
                <p className="text-h2 font-semibold tabular">
                  {q.data.coverage.reposWithReleases} / {q.data.coverage.reposTotal}
                </p>
                <p className="text-caption text-muted-foreground">
                  {q.data.coverage.reposWithout} without
                </p>
              </div>
              <div className="rounded-lg border bg-surface p-3">
                <p className="text-caption text-muted-foreground">Latest release</p>
                {q.data.latest ? (
                  <>
                    <ExternalLink url={q.data.latest.url}>
                      <span className="text-body font-semibold">
                        {q.data.latest.tagName ?? q.data.latest.name ?? "release"}
                      </span>
                    </ExternalLink>
                    <p className="text-caption text-muted-foreground">
                      {q.data.latest.repoFullName} · {shortDate(q.data.latest.publishedDate)}
                    </p>
                  </>
                ) : (
                  <p className="text-h2 font-semibold">—</p>
                )}
              </div>
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <TrendCard metric={q.data.trend} title="Releases over time" />
            <DistributionCard metric={q.data.byRepository} title="Releases by repository" />
          </div>

          <ReleaseList repo={repo} />
        </>
      )}
    </div>
  );
}

export function GitHubReleases() {
  return (
    <MetricDefinitionProvider>
      <Body />
    </MetricDefinitionProvider>
  );
}
