"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { formatDate } from "@/components/data/detail";
import { ListSkeleton } from "@/components/data/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

import { Freshness, GithubError, SyncButton } from "./common";
import { useGithubRepos } from "./use-github";

const ACTIVITY = [
  { value: "", label: "Any activity" },
  { value: "recent", label: "Active (≤30d)" },
  { value: "idle_30", label: "No activity 30+ days" },
  { value: "idle_90", label: "No activity 90+ days" },
  { value: "idle_180", label: "No activity 180+ days" },
];
const SORTS = [
  { value: "pushed", label: "Last activity" },
  { value: "updated", label: "Last updated" },
  { value: "name", label: "Name" },
  { value: "stars", label: "Stars" },
  { value: "forks", label: "Forks" },
  { value: "issues", label: "Open issues" },
  { value: "commits", label: "Synced commits" },
];

export function GitHubRepositories() {
  const sp = useSearchParams();
  const [q, setQ] = useState("");
  const [visibility, setVisibility] = useState(sp.get("visibility") ?? "");
  const [type, setType] = useState(sp.get("type") ?? "");
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [language, setLanguage] = useState(sp.get("language") ?? "");
  const [activity, setActivity] = useState(sp.get("activity") ?? "");
  const [sort, setSort] = useState("pushed");
  const [page, setPage] = useState(1);

  const params = {
    q: q || undefined,
    visibility: visibility || undefined,
    type: type || undefined,
    status: status || undefined,
    language: language || undefined,
    activity: activity || undefined,
    sort,
    page,
    pageSize: 25,
  };
  const query = useGithubRepos(params);
  if (query.isError)
    return <GithubError error={query.error} onRetry={() => void query.refetch()} />;

  const r = query.data;
  const languages = r?.facets.languages ?? [];

  const reset = () => setPage(1);
  const field = (set: (v: string) => void) => (e: { target: { value: string } }) => {
    set(e.target.value);
    reset();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-lg border bg-surface p-3">
        <div className="flex flex-wrap items-end gap-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              reset();
            }}
            className="flex min-w-48 grow gap-1"
          >
            <Input
              value={q}
              onChange={field(setQ)}
              placeholder="Search name, owner, description…"
              aria-label="Search repositories"
            />
          </form>
          <SyncButton lastSyncedAt={r?.lastSyncedAt ?? null} />
        </div>
        <div className="flex flex-wrap gap-2">
          <NativeSelect aria-label="Visibility" value={visibility} onChange={field(setVisibility)}>
            <option value="">All visibility</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </NativeSelect>
          <NativeSelect aria-label="Type" value={type} onChange={field(setType)}>
            <option value="">All types</option>
            <option value="original">Original</option>
            <option value="fork">Fork</option>
          </NativeSelect>
          <NativeSelect aria-label="Status" value={status} onChange={field(setStatus)}>
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </NativeSelect>
          <NativeSelect aria-label="Language" value={language} onChange={field(setLanguage)}>
            <option value="">All languages</option>
            {languages.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Activity" value={activity} onChange={field(setActivity)}>
            {ACTIVITY.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Sort" value={sort} onChange={field(setSort)}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                Sort: {s.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {query.isPending ? (
        <ListSkeleton rows={8} />
      ) : !r?.synced ? (
        <p className="p-4 text-muted-foreground">
          Not synchronized yet — run Sync GitHub to load repositories.
        </p>
      ) : r.data.length === 0 ? (
        <p className="p-4 text-muted-foreground">No repositories match these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-caption">
            <caption className="sr-only">GitHub repositories</caption>
            <thead className="border-b bg-surface-sunken">
              <tr>
                <th scope="col" className="px-3 py-2">
                  Repository
                </th>
                <th scope="col" className="px-3 py-2">
                  Visibility
                </th>
                <th scope="col" className="px-3 py-2">
                  Language
                </th>
                <th scope="col" className="px-3 py-2 tabular">
                  Stars
                </th>
                <th scope="col" className="px-3 py-2 tabular">
                  Commits
                </th>
                <th scope="col" className="px-3 py-2">
                  Last activity
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {r.data.map((repo) => (
                <tr key={repo.externalId}>
                  <td className="px-3 py-2">
                    <Link
                      href={`/github/repositories/${repo.externalId}`}
                      className="font-medium hover:underline"
                    >
                      {repo.fullName}
                    </Link>
                    {repo.archived && (
                      <Badge tone="neutral" className="ml-2">
                        Archived
                      </Badge>
                    )}
                    {repo.fork && (
                      <Badge tone="neutral" className="ml-2">
                        Fork
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={repo.visibility === "private" ? "warning" : "neutral"}>
                      {repo.visibility}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">{repo.language ?? "—"}</td>
                  <td className="px-3 py-2 tabular">{repo.stars}</td>
                  <td className="px-3 py-2 tabular">{repo.recentCommits}</td>
                  <td className="px-3 py-2">
                    {(repo.lastCommitDate ?? repo.pushedDate)
                      ? formatDate((repo.lastCommitDate ?? repo.pushedDate)!)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {r && r.page.total > 0 && (
        <div className="flex items-center justify-between">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-caption text-muted-foreground">
            Page {r.page.page} of {r.page.totalPages} · {r.page.total} repositories
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= r.page.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
      {r && <Freshness lastSyncedAt={r.lastSyncedAt} />}
    </div>
  );
}
