"use client";

import Link from "next/link";
import { useState } from "react";

import { formatDate } from "@/components/data/detail";
import { ErrorState, ListSkeleton } from "@/components/data/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { useApiList } from "@/lib/api/hooks";
import { ApiError } from "@/lib/http/fetch-json";

import { useActivity, useCommits, useLinkRepo, useRepository } from "./use-integrations";

interface CommitDto {
  sha: string;
  message: string;
  author: { name: string | null; login: string | null };
  authoredDate: string | null;
  committedDate: string | null;
  url: string;
  provenance: { externalRef: string; observedAt: string };
}
interface ActivityDto {
  externalId: string;
  type: string;
  actor: string | null;
  createdDate: string | null;
  provenance: { externalRef: string };
}

function Provenance({ repoRef, observedAt }: { repoRef: string; observedAt: string }) {
  return (
    <p className="text-caption text-muted-foreground">
      Source: GitHub · External ID: {repoRef} · Observed {new Date(observedAt).toLocaleString()}
    </p>
  );
}

function CommitsTab({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const q = useCommits(id, { page, perPage: 20 });
  if (q.isPending) return <ListSkeleton rows={5} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const data = (q.data as { data: { data: CommitDto[]; page: { hasNextPage: boolean } } }).data;
  if (data.data.length === 0) return <p className="p-4 text-muted-foreground">No commits.</p>;
  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y rounded-lg border">
        {data.data.map((c) => (
          <li key={c.sha} className="flex flex-col gap-0.5 px-3 py-2">
            <a
              href={c.url}
              target="_blank"
              rel="noreferrer"
              className="font-medium hover:underline"
            >
              {c.message.split("\n")[0]}
            </a>
            <span className="text-caption text-muted-foreground tabular">
              {c.sha.slice(0, 7)} · {c.author.login ?? c.author.name ?? "unknown"} · authored{" "}
              {c.authoredDate ? formatDate(c.authoredDate) : "—"} · committed{" "}
              {c.committedDate ? formatDate(c.committedDate) : "—"}
            </span>
          </li>
        ))}
      </ul>
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
          disabled={!data.page.hasNextPage}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function ActivityTab({ id }: { id: string }) {
  const q = useActivity(id, { page: 1, perPage: 30 });
  if (q.isPending) return <ListSkeleton rows={5} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const data = (q.data as { data: { data: ActivityDto[] } }).data;
  if (data.data.length === 0)
    return <p className="p-4 text-muted-foreground">No recent activity available.</p>;
  return (
    <ul className="divide-y rounded-lg border">
      {data.data.map((e) => (
        <li key={e.externalId} className="flex flex-col gap-0.5 px-3 py-2">
          <span className="font-medium">{e.type.replace(/Event$/, "")}</span>
          <span className="text-caption text-muted-foreground">
            {e.actor ?? "someone"} · {e.createdDate ? formatDate(e.createdDate) : "—"} · Source:
            GitHub
          </span>
        </li>
      ))}
    </ul>
  );
}

function ProjectLinks({ id }: { id: string }) {
  const detail = useRepository(id);
  const projects = useApiList<{ id: string; name: string }>("projects", "/api/v1/projects", {
    pageSize: 100,
  });
  const link = useLinkRepo(id);
  const [projectId, setProjectId] = useState("");
  const links = detail.data?.links ?? [];

  return (
    <section aria-labelledby="repo-links" className="rounded-lg border bg-surface p-3">
      <h3 id="repo-links" className="text-h3 font-semibold">
        Linked PEOS projects
      </h3>
      <p className="mt-0.5 text-caption text-muted-foreground">
        Explicit, owner-controlled links. PEOS never links repositories automatically.
      </p>
      {links.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {links.map((l) => (
            <li key={l.linkId} className="flex items-center justify-between gap-2 text-caption">
              <Link href={`/projects/${l.projectId}`} className="hover:underline">
                {l.projectName}
              </Link>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => link.mutate({ projectId: l.projectId, remove: true })}
                aria-label={`Unlink ${l.projectName}`}
              >
                Unlink
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-caption text-muted-foreground">Not linked to any project yet.</p>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="flex min-w-48 flex-col gap-1">
          <label htmlFor="link-project" className="text-caption text-muted-foreground">
            Link a project
          </label>
          <NativeSelect
            id="link-project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">Choose a project…</option>
            {(projects.data?.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button
          size="sm"
          disabled={!projectId || link.isPending}
          onClick={() => {
            link.mutate({ projectId });
            setProjectId("");
          }}
        >
          Link
        </Button>
      </div>
    </section>
  );
}

export function GitHubRepository({
  id,
  backHref = "/settings/integrations/github",
}: {
  id: string;
  backHref?: string;
}) {
  const [tab, setTab] = useState<"commits" | "activity">("commits");
  const detail = useRepository(id);

  if (detail.isError) {
    const err = detail.error;
    if (err instanceof ApiError && err.body?.code === "INTEGRATION_NOT_CONNECTED") {
      return (
        <div className="rounded-lg border border-dashed bg-surface p-6 text-center">
          <p className="text-muted-foreground">GitHub is not connected.</p>
          <Button asChild size="sm" className="mt-3">
            <Link href="/settings/integrations">Connect GitHub</Link>
          </Button>
        </div>
      );
    }
    if (err instanceof ApiError && err.body?.code === "EXTERNAL_RESOURCE_NOT_FOUND") {
      return (
        <p className="p-4 text-muted-foreground">
          This repository is not in your synchronized list.{" "}
          <Link href={backHref} className="underline underline-offset-4">
            Back to repositories
          </Link>
        </p>
      );
    }
    return <ErrorState error={err} onRetry={() => void detail.refetch()} />;
  }
  if (detail.isPending) return <ListSkeleton rows={6} />;

  const r = detail.data.repository;
  return (
    <div className="flex flex-col gap-4">
      <Link href={backHref} className="text-caption underline underline-offset-4">
        ← Repositories
      </Link>
      <section className="rounded-lg border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-h2 font-semibold">{r.fullName}</h2>
          <Badge tone={r.visibility === "private" ? "warning" : "neutral"}>{r.visibility}</Badge>
          {r.archived && <Badge tone="neutral">Archived</Badge>}
        </div>
        {r.description && <p className="mt-1 text-muted-foreground">{r.description}</p>}
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-caption sm:grid-cols-4">
          <dt className="text-muted-foreground">Default branch</dt>
          <dd>{r.defaultBranch ?? "—"}</dd>
          <dt className="text-muted-foreground">Language</dt>
          <dd>{r.language ?? "—"}</dd>
          <dt className="text-muted-foreground">Stars / Forks</dt>
          <dd className="tabular">
            {r.stars} / {r.forks}
          </dd>
          <dt className="text-muted-foreground">Pushed</dt>
          <dd>{r.pushedDate ? formatDate(r.pushedDate) : "—"}</dd>
        </dl>
        <div className="mt-2">
          <a
            href={r.url}
            target="_blank"
            rel="noreferrer"
            className="text-caption underline underline-offset-4"
          >
            Open on GitHub
          </a>
        </div>
        <div className="mt-2">
          <Provenance
            repoRef={`github:repository:${r.externalId}`}
            observedAt={r.updatedDate ?? new Date().toISOString()}
          />
        </div>
      </section>

      <ProjectLinks id={id} />

      <div>
        <div role="tablist" aria-label="Repository details" className="mb-2 flex gap-1">
          {(["commits", "activity"] as const).map((t) => (
            <Button
              key={t}
              role="tab"
              aria-selected={tab === t}
              size="sm"
              variant={tab === t ? "default" : "outline"}
              onClick={() => setTab(t)}
            >
              {t === "commits" ? "Commits" : "Activity"}
            </Button>
          ))}
        </div>
        {tab === "commits" ? <CommitsTab id={id} /> : <ActivityTab id={id} />}
      </div>
    </div>
  );
}
