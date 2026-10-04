"use client";

import { useState } from "react";

import { formatDate } from "@/components/data/detail";
import { ListSkeleton } from "@/components/data/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { GoogleError } from "./not-connected";
import { useDriveFiles, type DriveFile } from "./use-google";

type View = "my" | "recent" | "shared";
const KIND_LABEL: Record<string, string> = {
  folder: "Folder",
  doc: "Google Doc",
  sheet: "Google Sheet",
  slides: "Google Slides",
  file: "File",
};

export function DriveWorkspace() {
  const [view, setView] = useState<View>("my");
  const [crumbs, setCrumbs] = useState<{ id: string; name: string }[]>([]);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");

  const folderId = crumbs.at(-1)?.id;
  const params =
    search !== ""
      ? { q: search, pageSize: 50 }
      : view === "recent"
        ? { recent: true, pageSize: 50 }
        : view === "shared"
          ? { shared: true, pageSize: 50 }
          : { folderId, pageSize: 100 };
  const files = useDriveFiles(params);

  if (files.isError)
    return <GoogleError error={files.error} onRetry={() => void files.refetch()} />;

  const open = (f: DriveFile) => {
    if (f.kind === "folder") {
      setCrumbs((c) => [...c, { id: f.externalId, name: f.name }]);
      setSearch("");
      setQ("");
    } else if (f.url) {
      window.open(f.url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-surface p-3">
        {(["my", "recent", "shared"] as const).map((v) => (
          <Button
            key={v}
            size="sm"
            variant={view === v && !search ? "default" : "outline"}
            onClick={() => {
              setView(v);
              setCrumbs([]);
              setSearch("");
              setQ("");
            }}
          >
            {v === "my" ? "My Drive" : v === "recent" ? "Recent" : "Shared"}
          </Button>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(q.trim());
          }}
          className="ml-auto flex gap-1"
        >
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search Drive…"
            aria-label="Search Drive"
          />
          <Button size="sm" variant="outline" type="submit">
            Search
          </Button>
        </form>
      </div>

      {view === "my" && !search && (
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-caption">
          <button
            type="button"
            className="underline underline-offset-4"
            onClick={() => setCrumbs([])}
          >
            My Drive
          </button>
          {crumbs.map((c, i) => (
            <span key={c.id}>
              {" / "}
              <button
                type="button"
                className="underline underline-offset-4"
                onClick={() => setCrumbs((cs) => cs.slice(0, i + 1))}
              >
                {c.name}
              </button>
            </span>
          ))}
        </nav>
      )}

      {files.isPending ? (
        <ListSkeleton rows={8} />
      ) : files.data.data.length === 0 ? (
        <p className="p-4 text-muted-foreground">No files here.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-caption">
            <caption className="sr-only">Google Drive files</caption>
            <thead className="border-b bg-surface-sunken">
              <tr>
                <th scope="col" className="px-3 py-2">
                  Name
                </th>
                <th scope="col" className="px-3 py-2">
                  Type
                </th>
                <th scope="col" className="px-3 py-2">
                  Owner
                </th>
                <th scope="col" className="px-3 py-2">
                  Modified
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {files.data.data.map((f) => (
                <tr key={f.externalId}>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="font-medium hover:underline"
                      onClick={() => open(f)}
                    >
                      {f.kind === "folder" ? "📁 " : ""}
                      {f.name}
                    </button>
                    {f.shared && (
                      <Badge tone="info" className="ml-2">
                        Shared
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">{KIND_LABEL[f.kind] ?? f.kind}</td>
                  <td className="px-3 py-2">{f.owner ?? "—"}</td>
                  <td className="px-3 py-2">{f.modifiedDate ? formatDate(f.modifiedDate) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {files.data && (
        <p className="text-caption text-muted-foreground">
          Fetched live {new Date(files.data.fetchedAt).toLocaleTimeString()} · open files in Google
          Drive (the source of truth).
        </p>
      )}
    </div>
  );
}
