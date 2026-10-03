"use client";

import Link from "next/link";
import { useState } from "react";

import { formatDate } from "@/components/data/detail";
import { ListSkeleton } from "@/components/data/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ApiError } from "@/lib/http/fetch-json";

import { useRepositories } from "./use-integrations";

function NotConnected() {
  return (
    <div className="rounded-lg border border-dashed bg-surface p-6 text-center">
      <h2 className="text-h3 font-semibold">GitHub is not connected.</h2>
      <p className="mx-auto mt-1 max-w-prose text-muted-foreground">
        Connect your GitHub account to browse repositories, commits and activity. No data is shown
        until you connect.
      </p>
      <Button asChild size="sm" className="mt-3">
        <Link href="/settings/integrations">Connect GitHub</Link>
      </Button>
    </div>
  );
}

export function GitHubExplorer() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [visibility, setVisibility] = useState("all");
  const query = useRepositories({ page, perPage: 30, q: q || undefined, visibility });

  if (query.isError) {
    const err = query.error;
    if (err instanceof ApiError && err.body?.code === "INTEGRATION_NOT_CONNECTED") {
      return <NotConnected />;
    }
    if (err instanceof ApiError && err.body?.code === "INTEGRATION_RATE_LIMITED") {
      return (
        <p role="alert" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
          GitHub is rate-limiting requests. Try again shortly; your last synchronized data is kept.
        </p>
      );
    }
    return (
      <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2">
        <p role="alert">GitHub is temporarily unavailable.</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const result = query.data?.data;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-surface p-3">
        <div className="flex min-w-48 flex-col gap-1">
          <label htmlFor="repo-q" className="text-caption text-muted-foreground">
            Search (within the current page)
          </label>
          <Input
            id="repo-q"
            value={q}
            placeholder="Name or description…"
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="repo-vis" className="text-caption text-muted-foreground">
            Visibility
          </label>
          <NativeSelect
            id="repo-vis"
            value={visibility}
            onChange={(e) => {
              setVisibility(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </NativeSelect>
        </div>
        {result && (
          <p className="text-caption text-muted-foreground">
            Fetched live {new Date(result.fetchedAt).toLocaleTimeString()}
            {result.filteredWithinPage && " · filtered within this page"}
          </p>
        )}
      </div>

      {query.isPending ? (
        <ListSkeleton rows={6} />
      ) : result && result.data.length === 0 ? (
        <p className="p-4 text-muted-foreground">No repositories match on this page.</p>
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
                <th scope="col" className="px-3 py-2">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {result?.data.map((r) => (
                <tr key={r.externalId}>
                  <td className="px-3 py-2">
                    <Link
                      href={`/settings/integrations/github/${r.externalId}`}
                      className="font-medium hover:underline"
                    >
                      {r.fullName}
                    </Link>
                    {r.archived && (
                      <Badge tone="neutral" className="ml-2">
                        Archived
                      </Badge>
                    )}
                    {r.fork && (
                      <Badge tone="neutral" className="ml-2">
                        Fork
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={r.visibility === "private" ? "warning" : "neutral"}>
                      {r.visibility}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">{r.language ?? "—"}</td>
                  <td className="px-3 py-2 tabular">{r.stars}</td>
                  <td className="px-3 py-2">{r.updatedDate ? formatDate(r.updatedDate) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </Button>
        <span className="text-caption text-muted-foreground">Page {page}</span>
        <Button
          size="sm"
          variant="outline"
          disabled={!result?.page.hasNextPage}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
