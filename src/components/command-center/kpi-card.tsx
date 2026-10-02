"use client";

import { Info } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MetricResult } from "@/modules/analytics/metric-result";

import { useShowDefinition } from "./metric-definition";

const formatNumber = (n: number) => new Intl.NumberFormat().format(n);

/** Comparison text: numbers only, never arrows or invented percentages (ADR 0019). */
export function comparisonText(metric: MetricResult): string | null {
  const c = metric.comparison;
  if (!c) return null;
  if (c.state === "available") {
    return `Previous ${c.period.days ?? ""} days (${c.period.from} – ${c.period.to}): ${formatNumber(c.previousValue)}`;
  }
  return c.reason;
}

/**
 * KPI tile: value, label, state, period/comparison, definition access and drill-down.
 * Missing data renders as "—" with the reason — never as a fabricated 0.
 */
export function KpiCard({
  metric,
  href,
  format = formatNumber,
  detail,
}: {
  metric: MetricResult;
  href: string | null;
  /** Value formatter, e.g. a percentage for ratio metrics. */
  format?: (value: number) => string;
  /** Extra explanation under the value, e.g. the numerator and denominator of a ratio. */
  detail?: string | null;
}) {
  const showDefinition = useShowDefinition();
  const hasValue = metric.value !== null;
  const display = hasValue ? format(metric.value!) : "—";
  const comparison = comparisonText(metric);
  const labelId = `kpi-${metric.key.replace(/\W/g, "-")}`;

  return (
    <article
      aria-labelledby={labelId}
      className="flex min-w-0 flex-col gap-1 rounded-lg border bg-surface p-3"
      data-metric={metric.key}
    >
      <div className="flex items-start justify-between gap-1">
        <h3 id={labelId} className="text-caption font-medium text-muted-foreground">
          {metric.name}
        </h3>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => showDefinition(metric.key)}
          aria-label={`Definition of ${metric.name}`}
          className="-mt-1 -mr-1"
        >
          <Info aria-hidden />
        </Button>
      </div>
      {href && hasValue ? (
        <Link
          href={href as never}
          className="w-fit text-metric font-semibold tabular hover:underline"
          aria-label={`${metric.name}: ${display}. View the records`}
        >
          {display}
        </Link>
      ) : (
        <p
          className="text-metric font-semibold text-muted-foreground tabular"
          aria-label={`${metric.name}: no value`}
        >
          {display}
        </p>
      )}
      {detail && hasValue && <p className="text-caption text-muted-foreground">{detail}</p>}
      {metric.stateReason && (
        <p className="text-caption text-muted-foreground">{metric.stateReason}</p>
      )}
      {metric.period && <p className="text-caption text-muted-foreground">{metric.period.label}</p>}
      {comparison && hasValue && <p className="text-caption text-muted-foreground">{comparison}</p>}
      {metric.filtersApplied.length > 0 && (
        <Badge className="mt-auto w-fit" title={metric.filtersApplied.join(", ")}>
          Filtered
        </Badge>
      )}
    </article>
  );
}
