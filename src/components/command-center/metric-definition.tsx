"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { MetricDefinition } from "@/modules/analytics/metric-catalogue";

import { useMetricCatalogue } from "./use-dashboard";

/** Full governance record of one metric (05 "Metric Governance"). */
export function MetricDefinitionDetails({ metric }: { metric: MetricDefinition }) {
  return (
    <dl className="grid gap-3 text-body">
      <div>
        <dt className="text-caption text-muted-foreground">Definition</dt>
        <dd>{metric.definition}</dd>
      </div>
      <div>
        <dt className="text-caption text-muted-foreground">Formula</dt>
        <dd className="rounded-md bg-surface-sunken px-2 py-1 font-mono text-caption break-words">
          {metric.formula}
        </dd>
      </div>
      <div>
        <dt className="text-caption text-muted-foreground">Source</dt>
        <dd>{metric.source.join(", ")}</dd>
      </div>
      <div>
        <dt className="text-caption text-muted-foreground">Frequency</dt>
        <dd>{metric.frequency}</dd>
      </div>
      <div>
        <dt className="text-caption text-muted-foreground">Owner</dt>
        <dd>{metric.owner}</dd>
      </div>
      <div>
        <dt className="text-caption text-muted-foreground">Caveats</dt>
        <dd>
          <ul className="list-disc pl-5">
            {metric.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </dd>
      </div>
      <div>
        <dt className="text-caption text-muted-foreground">Availability</dt>
        <dd>
          {metric.availability.status === "available" ? (
            <Badge tone="success">Available</Badge>
          ) : (
            <span className="flex flex-col gap-1">
              <Badge tone="warning" className="w-fit">
                Unavailable — {metric.availability.plannedPhase}
              </Badge>
              <span>{metric.availability.reason}</span>
            </span>
          )}
        </dd>
      </div>
      {metric.drillDown && (
        <div>
          <dt className="text-caption text-muted-foreground">Drill-down</dt>
          <dd>{metric.drillDown}</dd>
        </div>
      )}
      <div className="text-caption text-muted-foreground">
        <dt className="inline">Specification: </dt>
        <dd className="inline">
          {metric.specRef} · key <span className="font-mono">{metric.key}</span> · version{" "}
          {metric.version} (revised {metric.revised})
        </dd>
      </div>
    </dl>
  );
}

const DefinitionContext = createContext<(key: string) => void>(() => {});

/** Lets any widget open the definition drawer for a metric key. */
export function useShowDefinition() {
  return useContext(DefinitionContext);
}

export function MetricDefinitionProvider({ children }: { children: ReactNode }) {
  const [key, setKey] = useState<string | null>(null);
  // The drawer has no Radix trigger, so remember the opener and return focus to it on close.
  const openerRef = useRef<HTMLElement | null>(null);
  const show = useCallback((next: string) => {
    openerRef.current = document.activeElement as HTMLElement | null;
    setKey(next);
  }, []);
  const catalogue = useMetricCatalogue();
  const metric = catalogue.data?.find((m) => m.key === key);

  return (
    <DefinitionContext.Provider value={show}>
      {children}
      <Sheet open={key !== null} onOpenChange={(open) => !open && setKey(null)}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-md"
          onCloseAutoFocus={(event) => {
            if (!openerRef.current?.isConnected) return;
            event.preventDefault();
            openerRef.current.focus();
          }}
        >
          <SheetHeader>
            <SheetTitle>{metric?.name ?? "Metric definition"}</SheetTitle>
            <SheetDescription>How this number is defined and calculated.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {catalogue.isError ? (
              <p role="alert">The metric catalogue could not be loaded.</p>
            ) : metric ? (
              <MetricDefinitionDetails metric={metric} />
            ) : (
              <p>Loading…</p>
            )}
            <p className="mt-4">
              <Link href="/command-center/metrics" className="underline underline-offset-4">
                All metric definitions
              </Link>
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </DefinitionContext.Provider>
  );
}
