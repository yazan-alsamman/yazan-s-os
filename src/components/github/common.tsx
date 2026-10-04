"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { ErrorState } from "@/components/data/states";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { ApiError, errorMessage } from "@/lib/http/fetch-json";

import { useGithubSync } from "./use-github";

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
