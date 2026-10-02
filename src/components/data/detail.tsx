"use client";

import { ArrowLeft, ExternalLink as ExternalIcon, Link2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href as never}
      className="mb-3 inline-flex items-center gap-1 text-body text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {label}
    </Link>
  );
}

export function DetailHeader({
  title,
  subtitle,
  badges,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-h1 font-semibold tracking-tight break-words">{title}</h1>
        {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
        {badges && <div className="mt-2 flex flex-wrap gap-1.5">{badges}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** External links are rendered only for http(s) URLs, opened safely in a new tab. */
export function ExternalLink({ href, children }: { href: string | null; children?: ReactNode }) {
  if (!href) return <span className="text-muted-foreground">—</span>;
  let safe = false;
  try {
    const url = new URL(href);
    safe = url.protocol === "https:" || url.protocol === "http:";
  } catch {
    safe = false;
  }
  if (!safe) return <span className="break-all">{href}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex items-center gap-1 break-all underline underline-offset-4"
    >
      {children ?? href}
      <ExternalIcon aria-hidden className="size-3.5 shrink-0" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

export interface FieldItem {
  label: string;
  value: ReactNode;
  wide?: boolean;
}

export function FieldGrid({ items }: { items: readonly FieldItem[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className={item.wide ? "sm:col-span-2" : undefined}>
          <dt className="text-caption text-muted-foreground">{item.label}</dt>
          <dd className="mt-0.5 break-words whitespace-pre-line">
            {item.value === null || item.value === undefined || item.value === "" ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              item.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const id = `panel-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="rounded-lg border bg-surface">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 id={id} className="text-h3 font-semibold">
          {title}
        </h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export interface RelationItem {
  id: string;
  label: string;
  href?: string;
  meta?: ReactNode;
}

/** A relationship list with a "Manage" action; shows an explicit empty state. */
export function RelationPanel({
  title,
  items,
  emptyText,
  onManage,
  manageLabel,
}: {
  title: string;
  items: readonly RelationItem[];
  emptyText: string;
  onManage?: () => void;
  manageLabel?: string;
}) {
  return (
    <Panel
      title={`${title} (${items.length})`}
      action={
        onManage && (
          <Button
            variant="outline"
            size="sm"
            onClick={onManage}
            aria-label={manageLabel ?? `Manage ${title.toLowerCase()}`}
          >
            <Link2 aria-hidden />
            Manage
          </Button>
        )
      }
    >
      {items.length === 0 ? (
        <p className="text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              {item.href ? (
                <Link href={item.href as never} className="font-medium hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span className="font-medium">{item.label}</span>
              )}
              {item.meta && <span className="flex flex-wrap gap-1 text-caption">{item.meta}</span>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export interface ProvenanceView {
  origin: "manual" | "import";
  import: {
    jobId: string;
    source: string;
    fileName: string;
    sourceRef: string;
    parserVersion: string;
    importedAt: string;
    confidence: string;
    reviewedAt: string | null;
    reviewedBy: string | null;
  } | null;
}

const SOURCE_LABELS: Record<string, string> = {
  peos_json: "PEOS JSON",
  csv: "CSV",
  linkedin_csv: "LinkedIn export",
};

/** Where did this record come from? (11 "Provenance") */
export function ProvenancePanel({ provenance }: { provenance: ProvenanceView | null }) {
  if (!provenance) return null;
  const imported = provenance.import;
  return (
    <Panel title="Provenance">
      {imported ? (
        <FieldGrid
          items={[
            {
              label: "Origin",
              value:
                provenance.origin === "import"
                  ? "Imported"
                  : "Entered manually, later updated from an import",
            },
            { label: "Source", value: SOURCE_LABELS[imported.source] ?? imported.source },
            {
              label: "File",
              value: (
                <Link
                  href={`/settings/import/${imported.jobId}` as never}
                  className="underline underline-offset-4"
                >
                  {imported.fileName} ({imported.sourceRef})
                </Link>
              ),
            },
            { label: "Imported", value: new Date(imported.importedAt).toLocaleString() },
            { label: "Parser", value: imported.parserVersion },
            { label: "Confidence", value: <Badge>{imported.confidence}</Badge> },
            {
              label: "Reviewed",
              value: imported.reviewedAt
                ? `${new Date(imported.reviewedAt).toLocaleString()}${imported.reviewedBy ? ` by ${imported.reviewedBy}` : ""}`
                : "Not reviewed",
            },
          ]}
        />
      ) : (
        <p className="text-muted-foreground">Entered manually in PEOS.</p>
      )}
    </Panel>
  );
}

export function DetailSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-8 w-72 max-w-full" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export function formatDate(value: string | null): string | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Snake/enum value → readable label. */
export function humanize(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
