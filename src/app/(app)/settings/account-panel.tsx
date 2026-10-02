"use client";

import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson } from "@/lib/http/fetch-json";
import type { AccountView } from "@/modules/account/account.service";

/** Loads the caller's account from GET /api/v1/me (loading, error and retry states). */
export function AccountPanel() {
  const query = useQuery({
    queryKey: ["me"],
    queryFn: () => fetchJson<{ data: AccountView }>("/api/v1/me").then((r) => r.data),
  });

  return (
    <section aria-labelledby="account-heading" className="rounded-lg border bg-surface">
      <h2 id="account-heading" className="border-b px-4 py-3 text-h3 font-semibold">
        Account
      </h2>
      <div className="p-4" aria-live="polite" aria-busy={query.isPending}>
        {query.isPending && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        )}

        {query.isError && (
          <div role="alert" className="flex flex-col items-start gap-3">
            <p className="text-danger">Your account details could not be loaded.</p>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </div>
        )}

        {query.data && (
          <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2">
            <dt className="text-muted-foreground">Name</dt>
            <dd className="min-w-0 truncate">{query.data.name}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="min-w-0 truncate">{query.data.email}</dd>
            <dt className="text-muted-foreground">Timezone</dt>
            <dd>{query.data.timezone}</dd>
            <dt className="text-muted-foreground">Member since</dt>
            <dd className="tabular">
              <time dateTime={query.data.createdAt}>
                {new Date(query.data.createdAt).toLocaleDateString()}
              </time>
            </dd>
          </dl>
        )}
      </div>
    </section>
  );
}
