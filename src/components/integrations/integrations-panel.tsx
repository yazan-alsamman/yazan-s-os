"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { ErrorState, ListSkeleton } from "@/components/data/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/http/fetch-json";

import {
  useConnect,
  useDisconnect,
  useProviders,
  useRefresh,
  useSync,
  type ProviderStatus,
} from "./use-integrations";

const STATUS: Record<
  string,
  { tone: "success" | "warning" | "danger" | "neutral"; label: string }
> = {
  connected: { tone: "success", label: "Connected" },
  degraded: { tone: "warning", label: "Degraded" },
  error: { tone: "danger", label: "Error" },
  expired: { tone: "warning", label: "Expired" },
  revoked: { tone: "neutral", label: "Revoked" },
  disconnected: { tone: "neutral", label: "Disconnected" },
};

function CallbackBanner() {
  const params = useSearchParams();
  const connected = params.get("connected");
  const error = params.get("error");
  if (connected) {
    return (
      <div
        role="status"
        className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-caption"
      >
        Connected {connected} successfully.
      </div>
    );
  }
  if (error) {
    return (
      <div
        role="alert"
        className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-caption"
      >
        The connection did not complete ({error.replace(/_/g, " ").toLowerCase()}). Nothing was
        changed.
      </div>
    );
  }
  return null;
}

function ProviderCard({ p }: { p: ProviderStatus }) {
  const connect = useConnect();
  const disconnect = useDisconnect();
  const sync = useSync();
  const refresh = useRefresh();
  const conn = p.connection;
  const status = conn ? STATUS[conn.status] : null;
  const busy = connect.isPending || disconnect.isPending || sync.isPending || refresh.isPending;

  const startConnect = async () => {
    const { authorizeUrl } = await connect.mutateAsync(p.provider);
    window.location.href = authorizeUrl;
  };

  return (
    <section
      aria-labelledby={`int-${p.provider}`}
      className="flex flex-col gap-3 rounded-lg border bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`int-${p.provider}`} className="text-h3 font-semibold">
          {p.displayName}
        </h3>
        {status ? (
          <Badge tone={status.tone}>{status.label}</Badge>
        ) : p.status === "scaffolded" ? (
          <Badge tone="neutral">Coming soon</Badge>
        ) : !p.configured ? (
          <Badge tone="neutral">Not configured</Badge>
        ) : (
          <Badge tone="neutral">Not connected</Badge>
        )}
      </div>

      <p className="text-caption text-muted-foreground">
        Reads: {p.resources.join(", ")}. {p.displayName} remains the source of truth.
      </p>

      {!p.configured && (
        <p className="text-caption text-muted-foreground">
          {p.status === "scaffolded"
            ? "This connector is scaffolded; Google (Gmail, Drive, Calendar) is planned for a later phase."
            : "Not configured on the server. Set the provider OAuth app credentials and INTEGRATION_ENCRYPTION_KEY (see docs/INTEGRATIONS.md)."}
        </p>
      )}

      {conn && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-caption">
          <dt className="text-muted-foreground">Account</dt>
          <dd>{conn.accountLogin ?? conn.accountEmail ?? conn.displayName}</dd>
          <dt className="text-muted-foreground">Scopes</dt>
          <dd className="tabular">{conn.scopes.join(", ") || "—"}</dd>
          <dt className="text-muted-foreground">Last sync</dt>
          <dd>{conn.lastSyncAt ? new Date(conn.lastSyncAt).toLocaleString() : "Never"}</dd>
          {conn.lastError && (
            <>
              <dt className="text-muted-foreground">Last error</dt>
              <dd className="text-danger">{conn.lastError}</dd>
            </>
          )}
        </dl>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {p.configured && !conn && (
          <Button type="button" size="sm" onClick={startConnect} disabled={busy}>
            Connect {p.displayName}
          </Button>
        )}
        {conn && conn.status !== "disconnected" && (
          <>
            {p.provider === "github" && (
              <Button asChild size="sm" variant="outline">
                <Link href="/settings/integrations/github">Explore repositories</Link>
              </Button>
            )}
            {p.provider === "github" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => sync.mutate(conn.id)}
                disabled={busy}
              >
                {sync.isPending ? "Syncing…" : "Sync"}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => refresh.mutate(conn.id)}
              disabled={busy}
            >
              Check
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => disconnect.mutate(conn.id)}
              disabled={busy}
            >
              Disconnect
            </Button>
          </>
        )}
        {conn && conn.status === "disconnected" && p.configured && (
          <Button type="button" size="sm" onClick={startConnect} disabled={busy}>
            Reconnect
          </Button>
        )}
      </div>
      {(connect.isError || disconnect.isError || sync.isError || refresh.isError) && (
        <p role="alert" className="text-caption text-danger">
          {errorMessage(connect.error ?? disconnect.error ?? sync.error ?? refresh.error)}
        </p>
      )}
    </section>
  );
}

export function IntegrationsPanel() {
  const providers = useProviders();
  return (
    <div className="flex flex-col gap-4">
      <CallbackBanner />
      {providers.isPending ? (
        <ListSkeleton rows={2} />
      ) : providers.isError ? (
        <ErrorState error={providers.error} onRetry={() => void providers.refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {providers.data.map((p) => (
            <ProviderCard key={p.provider} p={p} />
          ))}
        </div>
      )}
      <p className="text-caption text-muted-foreground">
        Tokens are encrypted at rest and never leave the server. Disconnecting discards stored
        credentials. See{" "}
        <Link href="/command-center" className="underline underline-offset-4">
          your data
        </Link>{" "}
        stays owner-scoped.
      </p>
    </div>
  );
}
