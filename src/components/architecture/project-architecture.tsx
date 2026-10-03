"use client";

import Link from "next/link";

import { formatDate } from "@/components/data/detail";
import { ErrorState, ListSkeleton } from "@/components/data/states";
import { Badge } from "@/components/ui/badge";
import { useApiList } from "@/lib/api/hooks";
import type { ComponentRow, DecisionRow } from "@/modules/architecture/architecture-intelligence";

import { DecisionStatusBadge } from "./architecture-lists";
import { COMPONENT_TYPE_LABEL } from "./options";

/**
 * The project's architecture as structured knowledge (08 Phase 7 acceptance): decisions and
 * components explicitly linked to this project, read from the architecture source lists.
 */
export function ProjectArchitecture({ projectId }: { projectId: string }) {
  const decisions = useApiList<DecisionRow>("architecture", "/api/v1/architecture/decisions", {
    projectId,
    pageSize: 20,
  });
  const components = useApiList<ComponentRow>("architecture", "/api/v1/architecture/components", {
    projectId,
    pageSize: 20,
  });
  if (decisions.isPending || components.isPending) return <ListSkeleton rows={3} />;
  if (decisions.isError)
    return <ErrorState error={decisions.error} onRetry={() => void decisions.refetch()} />;
  if (components.isError)
    return <ErrorState error={components.error} onRetry={() => void components.refetch()} />;
  const d = decisions.data;
  const c = components.data;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section aria-labelledby="pa-decisions" className="rounded-lg border bg-surface">
        <header className="border-b px-4 py-2.5">
          <h3 id="pa-decisions" className="text-h3 font-semibold">
            Architecture decisions ({d.page.total})
          </h3>
        </header>
        <div className="p-4">
          {d.data.length === 0 ? (
            <p className="text-muted-foreground">
              No architecture decision is linked to this project.{" "}
              <Link href="/architecture" className="underline underline-offset-4">
                Document one
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y">
              {d.data.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <Link
                    href={`/architecture/${x.id}` as never}
                    className="font-medium hover:underline"
                  >
                    {x.title}
                  </Link>
                  <span className="flex flex-wrap items-center gap-1">
                    <DecisionStatusBadge status={x.status} />
                    {x.decidedAt && (
                      <span className="text-caption text-muted-foreground tabular">
                        {formatDate(x.decidedAt)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {d.page.total > d.data.length && (
            <Link
              href={`/architecture?projectId=${projectId}` as never}
              className="mt-2 inline-block text-caption underline underline-offset-4"
            >
              View all {d.page.total}
            </Link>
          )}
        </div>
      </section>
      <section aria-labelledby="pa-components" className="rounded-lg border bg-surface">
        <header className="border-b px-4 py-2.5">
          <h3 id="pa-components" className="text-h3 font-semibold">
            Components ({c.page.total})
          </h3>
        </header>
        <div className="p-4">
          {c.data.length === 0 ? (
            <p className="text-muted-foreground">
              No architecture component is linked to this project.
            </p>
          ) : (
            <ul className="divide-y">
              {c.data.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <Link
                    href={`/architecture/components/${x.id}` as never}
                    className="font-medium hover:underline"
                  >
                    {x.name}
                  </Link>
                  <span className="flex flex-wrap gap-1">
                    <Badge>{COMPONENT_TYPE_LABEL[x.type]}</Badge>
                    {x.critical && <Badge tone="danger">Critical</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {c.data.length > 0 && (
            <Link
              href={`/architecture/map?projectId=${projectId}` as never}
              className="mt-2 inline-block text-caption underline underline-offset-4"
            >
              Open this project&apos;s architecture map
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
