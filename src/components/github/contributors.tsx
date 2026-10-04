"use client";

import { useState } from "react";

import { KpiCard } from "@/components/command-center/kpi-card";
import { MetricDefinitionProvider } from "@/components/command-center/metric-definition";
import { ListSkeleton } from "@/components/data/states";
import { Badge } from "@/components/ui/badge";

import {
  DistributionCard,
  ExternalLink,
  GithubError,
  Pager,
  RepoFilter,
  SyncButton,
  SyncStatusBanner,
} from "./common";
import {
  useGithubContributorList,
  useGithubContributors,
  useGithubSyncStatus,
  type ContributorRow,
} from "./use-github";

function ContributorTable({
  repo,
  authenticatedLogin,
}: {
  repo: string;
  authenticatedLogin: string | null;
}) {
  const [page, setPage] = useState(1);
  const q = useGithubContributorList({ repo: repo || undefined, page });
  const rows = q.data?.data ?? [];
  return (
    <section aria-labelledby="contrib-list" className="flex flex-col gap-2">
      <h2 id="contrib-list" className="text-h4 font-semibold">
        Contributors
      </h2>
      <p className="text-caption text-muted-foreground">
        Contribution counts are GitHub&rsquo;s own commit attribution per repository — evidence,
        never a ranking or quality score.
      </p>
      {q.isPending ? (
        <ListSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <p className="rounded-md border bg-surface px-3 py-6 text-center text-muted-foreground">
          No contributors synchronized for this scope.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-surface">
          <table className="w-full text-body">
            <caption className="sr-only">
              Contributors by repository with contribution counts
            </caption>
            <thead className="text-caption text-muted-foreground">
              <tr className="border-b text-left">
                <th scope="col" className="px-3 py-2 font-medium">
                  Contributor
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Repository
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Contributions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c: ContributorRow) => (
                <tr key={`${c.repoExternalId}-${c.login}`} className="border-b last:border-0">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <ExternalLink url={c.url}>{c.login}</ExternalLink>
                    {authenticatedLogin && c.login === authenticatedLogin && (
                      <Badge tone="info" className="ml-2">
                        you
                      </Badge>
                    )}
                  </th>
                  <td className="px-3 py-2 text-muted-foreground">{c.repoFullName}</td>
                  <td className="px-3 py-2 text-right tabular">{c.contributions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  const [repo, setRepo] = useState("");
  const status = useGithubSyncStatus();
  const q = useGithubContributors({ repo: repo || undefined });

  if (q.isError) return <GithubError error={q.error} onRetry={() => void q.refetch()} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-muted-foreground">Repository</span>
          <RepoFilter value={repo} onChange={setRepo} />
        </div>
        <SyncButton lastSyncedAt={status.data?.connection.lastSyncAt ?? null} />
      </div>
      <SyncStatusBanner />
      {q.isPending ? (
        <ListSkeleton rows={6} />
      ) : (
        <>
          <section aria-labelledby="contrib-kpis">
            <h2 id="contrib-kpis" className="sr-only">
              Contributor indicators
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <KpiCard metric={q.data.total} href={null} />
              {q.data.authenticatedLogin && (
                <div className="rounded-lg border bg-surface p-3">
                  <p className="text-caption text-muted-foreground">Authenticated account</p>
                  <p className="text-h2 font-semibold">{q.data.authenticatedLogin}</p>
                  <p className="text-caption text-muted-foreground">
                    Repository contributors are distinct from your connected account.
                  </p>
                </div>
              )}
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <DistributionCard
              metric={q.data.byRepository}
              title="Distinct contributors by repository"
            />
            <DistributionCard
              metric={q.data.activity}
              title="Contributions by contributor (GitHub attribution)"
            />
          </div>

          <ContributorTable repo={repo} authenticatedLogin={q.data.authenticatedLogin} />
        </>
      )}
    </div>
  );
}

export function GitHubContributors() {
  return (
    <MetricDefinitionProvider>
      <Body />
    </MetricDefinitionProvider>
  );
}
