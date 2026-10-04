"use client";

import { useState } from "react";

import { MetricDefinitionProvider } from "@/components/command-center/metric-definition";
import { ListSkeleton } from "@/components/data/states";
import { Button } from "@/components/ui/button";

import { ExternalLink, GithubError, PeriodSelect, shortDate, SyncStatusBanner } from "./common";
import { useGithubComparison, useGithubRepos, type ComparisonRow } from "./use-github";

/** Independent metrics only — never combined into a single repository score (ADR 0055). */
const METRICS: { key: keyof ComparisonRow; label: string; kind: "num" | "date" }[] = [
  { key: "commits", label: "Commits", kind: "num" },
  { key: "activeDays", label: "Active days", kind: "num" },
  { key: "pullRequests", label: "Pull requests", kind: "num" },
  { key: "mergedPullRequests", label: "Merged PRs", kind: "num" },
  { key: "issues", label: "Issues", kind: "num" },
  { key: "releases", label: "Releases", kind: "num" },
  { key: "contributors", label: "Contributors", kind: "num" },
  { key: "additions", label: "Additions", kind: "num" },
  { key: "deletions", label: "Deletions", kind: "num" },
  { key: "lastActivity", label: "Last activity", kind: "date" },
];

const fmtNum = (v: number | null) => (v === null ? "—" : new Intl.NumberFormat().format(v));

function RepoPicker({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const q = useGithubRepos({ pageSize: 100, sort: "pushed" });
  const repos = q.data?.data ?? [];
  if (q.isError) return <GithubError error={q.error} onRetry={() => void q.refetch()} />;
  if (q.isPending) return <ListSkeleton rows={4} />;
  if (repos.length === 0)
    return <p className="text-caption text-muted-foreground">No repositories synchronized yet.</p>;
  return (
    <fieldset className="rounded-lg border bg-surface p-3">
      <legend className="px-1 text-caption text-muted-foreground">
        Select 2–6 repositories ({selected.length} selected)
      </legend>
      <ul className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
        {repos.map((r) => {
          const checked = selected.includes(r.externalId);
          const atLimit = selected.length >= 6 && !checked;
          return (
            <li key={r.externalId}>
              <label
                className={`flex items-center gap-2 rounded-md px-2 py-1 text-caption ${
                  atLimit ? "opacity-50" : "hover:bg-surface-sunken"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={atLimit}
                  onChange={() => onToggle(r.externalId)}
                />
                <span className="truncate" title={r.fullName}>
                  {r.fullName}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

function ComparisonTable({ range, repoIds }: { range: string; repoIds: string[] }) {
  const q = useGithubComparison({ range, repoIds: repoIds.join(",") });
  if (q.isError) return <GithubError error={q.error} onRetry={() => void q.refetch()} />;
  if (q.isPending) return <ListSkeleton rows={6} />;
  const repos = q.data.repositories;
  if (repos.length === 0)
    return <p className="text-muted-foreground">No data for the selected repositories.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border bg-surface">
      <table className="w-full text-body">
        <caption className="sr-only">
          Per-metric repository comparison ({q.data.period.label}); each metric is independent.
        </caption>
        <thead className="text-caption text-muted-foreground">
          <tr className="border-b text-left">
            <th scope="col" className="px-3 py-2 font-medium">
              Metric
            </th>
            {repos.map((r: ComparisonRow) => (
              <th key={r.externalId} scope="col" className="px-3 py-2 font-medium">
                <ExternalLink url={`https://github.com/${r.fullName}`}>{r.fullName}</ExternalLink>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRICS.map((m) => (
            <tr key={m.key} className="border-b last:border-0">
              <th scope="row" className="px-3 py-2 text-left font-normal text-muted-foreground">
                {m.label}
              </th>
              {repos.map((r) => {
                const v = r[m.key];
                return (
                  <td key={r.externalId} className="px-3 py-2 tabular">
                    {m.kind === "date" ? shortDate(v as string | null) : fmtNum(v as number | null)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Body() {
  const [range, setRange] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [applied, setApplied] = useState<string[]>([]);

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 6 ? prev : [...prev, id],
    );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-surface p-3">
        <span className="text-caption text-muted-foreground">Period</span>
        <PeriodSelect value={range} onChange={setRange} />
      </div>
      <SyncStatusBanner />

      <RepoPicker selected={selected} onToggle={toggle} />
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={selected.length < 2} onClick={() => setApplied(selected)}>
          Compare {selected.length >= 2 ? `${selected.length} repositories` : ""}
        </Button>
        <span className="text-caption text-muted-foreground">
          Repositories are compared metric-by-metric; PEOS never combines them into one score.
        </span>
      </div>

      {applied.length >= 2 && <ComparisonTable range={range} repoIds={applied} />}
    </div>
  );
}

export function GitHubCompare() {
  return (
    <MetricDefinitionProvider>
      <Body />
    </MetricDefinitionProvider>
  );
}
