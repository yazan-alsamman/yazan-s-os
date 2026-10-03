"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { ChartCard } from "@/components/charts/chart-card";
import { EChart, type ChartPalette } from "@/components/charts/echart";
import { bucketHref, metricHref } from "@/components/command-center/drilldown";
import { KpiCard } from "@/components/command-center/kpi-card";
import {
  MetricDefinitionProvider,
  useShowDefinition,
} from "@/components/command-center/metric-definition";
import { distributionOption, distributionTable } from "@/components/command-center/sections";
import { formatDate } from "@/components/data/detail";
import { ResourceList } from "@/components/data/resource-list";
import { ErrorState, ListSkeleton } from "@/components/data/states";
import { percent } from "@/components/projects/dossier";
import { Badge } from "@/components/ui/badge";
import { useApiGet } from "@/lib/api/hooks";
import type { ArchitectureAnalyticsDto } from "@/modules/analytics/architecture-analytics.service";
import type { MetricResult } from "@/modules/analytics/metric-result";
import type { ComponentRow, DecisionRow } from "@/modules/architecture/architecture-intelligence";

import {
  COMPONENT_FIELDS,
  COMPONENT_TYPE_LABEL,
  DECISION_CREATE_FIELDS,
  DECISION_EDIT_FIELDS,
  DECISION_STATUS_LABEL,
  DOCUMENTATION_PART_LABEL,
  STATUS_OPTIONS,
  STATUS_TONE,
  TYPE_OPTIONS,
} from "./options";

const yesNo = (v: string) => (v === "true" ? "yes" : "no");

export function DecisionStatusBadge({ status }: { status: keyof typeof STATUS_TONE }) {
  return <Badge tone={STATUS_TONE[status]}>{DECISION_STATUS_LABEL[status]}</Badge>;
}

/** Decisions list — the source list for every decision metric (ADR 0045). */
export function DecisionsList() {
  return (
    <ResourceList<DecisionRow>
      resource="architecture"
      path="/api/v1/architecture/decisions"
      singular="decision"
      plural="decisions"
      related={["analytics", "projects", "evidence"]}
      rowLabel={(d) => d.title}
      detailHref={(d) => `/architecture/${d.id}`}
      extraParams={[
        { name: "inForce", label: "In force (accepted)", format: yesNo },
        { name: "revisitDue", label: "Revisit due", format: yesNo },
        { name: "staleCritical", label: "Stale critical", format: yesNo },
        { name: "incomplete", label: "Documentation gaps", format: yesNo },
        { name: "hasEvidence", label: "Has evidence", format: yesNo },
        { name: "hasProjects", label: "Has projects", format: yesNo },
        { name: "hasAlternatives", label: "Has alternatives", format: yesNo },
        { name: "projectId", label: "Project", format: () => "selected project" },
        { name: "componentId", label: "Component", format: () => "selected component" },
        { name: "decidedFrom", label: "Decided from" },
        { name: "decidedTo", label: "Decided to" },
      ]}
      searchPlaceholder="Title, context, problem, decision, consequences…"
      filters={[{ name: "status", label: "Status", options: STATUS_OPTIONS }]}
      sortOptions={[
        { value: "decidedAt", label: "Newest decision" },
        { value: "revisitDate", label: "Revisit date" },
        { value: "title", label: "Title A–Z" },
        { value: "status", label: "Status" },
        { value: "updatedAt", label: "Recently updated" },
      ]}
      defaultSort="decidedAt"
      fields={DECISION_CREATE_FIELDS}
      editFields={DECISION_EDIT_FIELDS}
      empty={{
        title: "No architecture decisions yet.",
        body: "Document a decision: its context, the options you considered, what you decided and the consequences. PEOS records your decisions — it never generates or infers them.",
      }}
      columns={[
        { header: "Decision", cell: (d) => d.title },
        { header: "Status", cell: (d) => <DecisionStatusBadge status={d.status} /> },
        {
          header: "Decided",
          className: "tabular",
          cell: (d) =>
            d.decidedAt ? (
              formatDate(d.decidedAt)
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
        {
          header: "Revisit",
          cell: (d) =>
            d.staleCritical ? (
              <Badge tone="danger">Stale critical</Badge>
            ) : d.revisitDue ? (
              <Badge tone="warning">Due {formatDate(d.revisitDate)}</Badge>
            ) : d.revisitDate ? (
              <span className="tabular">{formatDate(d.revisitDate)}</span>
            ) : (
              <span className="text-muted-foreground">No date</span>
            ),
        },
        {
          header: "Gaps",
          cell: (d) =>
            d.gaps.length === 0 ? (
              <span className="text-muted-foreground">None</span>
            ) : (
              <span className="text-caption">
                {d.gaps.map((g) => DOCUMENTATION_PART_LABEL[g]).join(", ")}
              </span>
            ),
        },
        {
          header: "Links",
          cell: (d) => (
            <span className="text-caption text-muted-foreground tabular">
              {d.counts.projects} projects · {d.counts.components} components · {d.counts.evidence}{" "}
              evidence
            </span>
          ),
        },
      ]}
    />
  );
}

/** Component registry — the source list for component metrics. */
export function ComponentsList() {
  return (
    <ResourceList<ComponentRow>
      resource="architecture"
      path="/api/v1/architecture/components"
      singular="component"
      plural="components"
      related={["analytics", "projects", "technologies"]}
      rowLabel={(c) => c.name}
      detailHref={(c) => `/architecture/components/${c.id}`}
      extraParams={[
        { name: "critical", label: "Critical", format: yesNo },
        { name: "hasDecisions", label: "Has decisions", format: yesNo },
        { name: "hasDependencies", label: "Has dependencies", format: yesNo },
        { name: "projectId", label: "Project", format: () => "selected project" },
        { name: "technologyId", label: "Technology", format: () => "selected technology" },
      ]}
      searchPlaceholder="Name or purpose…"
      filters={[{ name: "type", label: "Type", options: TYPE_OPTIONS }]}
      sortOptions={[
        { value: "name", label: "Name A–Z" },
        { value: "type", label: "Type" },
        { value: "updatedAt", label: "Recently updated" },
      ]}
      defaultSort="name"
      fields={COMPONENT_FIELDS}
      empty={{
        title: "No components yet.",
        body: "Register the services, databases, queues, external APIs, AI models and infrastructure of your systems, then record how they depend on each other.",
      }}
      columns={[
        { header: "Component", cell: (c) => c.name },
        { header: "Type", cell: (c) => COMPONENT_TYPE_LABEL[c.type] },
        {
          header: "Critical",
          cell: (c) =>
            c.critical ? (
              <Badge tone="danger">Critical</Badge>
            ) : (
              <span className="text-muted-foreground">No</span>
            ),
        },
        {
          header: "Links",
          cell: (c) => (
            <span className="text-caption text-muted-foreground tabular">
              {c.counts.decisions} decisions · {c.counts.dependsOn} depends on ·{" "}
              {c.counts.dependents} dependents · {c.counts.projects} projects
            </span>
          ),
        },
      ]}
    />
  );
}

// ── Analytics ───────────────────────────────────────────────────────────────

function Meta({ data, metric }: { data: ArchitectureAnalyticsDto; metric: MetricResult }) {
  return (
    <>
      {[
        `Current state, evaluated ${formatDate(data.evaluatedOn)} (UTC)`,
        `Source: ${metric.source.join(", ")}`,
        `Calculated ${new Date(data.calculatedAt).toLocaleTimeString()}`,
      ].join(" · ")}
    </>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="p-4 text-muted-foreground">{children}</div>;
}

const STATUS_COLOR: Record<string, keyof ChartPalette> = {
  proposed: "brand",
  accepted: "success",
  rejected: "neutral",
  deprecated: "warning",
  superseded: "neutral",
};

function Distribution({
  data,
  metric,
  title,
  interpretation,
  colors,
  csvName,
  emptyText,
}: {
  data: ArchitectureAnalyticsDto;
  metric: MetricResult;
  title: string;
  interpretation: string | null;
  colors: (p: ChartPalette, key: string) => string;
  csvName: string;
  emptyText: string;
}) {
  const router = useRouter();
  const showDefinition = useShowDefinition();
  const buckets = metric.breakdown ?? [];
  const hasData = metric.state === "ok";
  const hrefFor = (key: string) => bucketHref(metric.key, key, {});
  return (
    <ChartCard
      title={title}
      interpretation={hasData ? interpretation : null}
      meta={<Meta data={data} metric={metric} />}
      onShowDefinition={() => showDefinition(metric.key)}
      csvName={csvName}
      table={hasData ? distributionTable(metric, hrefFor) : null}
      empty={hasData ? undefined : <Empty>{metric.stateReason ?? emptyText}</Empty>}
    >
      <EChart
        dataKey={JSON.stringify(buckets)}
        height={Math.max(140, buckets.length * 30)}
        ariaLabel={`Bar chart of ${title.toLowerCase()}: ${buckets.map((b) => `${b.label} ${b.value}`).join(", ")}.`}
        option={distributionOption(buckets, colors)}
        onSelect={(i) => {
          const target = hrefFor(buckets[i]?.key ?? "");
          if (target) router.push(target as never);
        }}
      />
    </ChartCard>
  );
}

function AttentionList({ data }: { data: ArchitectureAnalyticsDto }) {
  const items = [
    ...data.attention.staleCritical.map((d) => ({ ...d, kind: "stale" as const })),
    ...data.attention.revisitDue.map((d) => ({ ...d, kind: "due" as const })),
  ];
  return (
    <section aria-labelledby="arch-attention" className="rounded-lg border bg-surface">
      <header className="border-b px-4 py-3">
        <h2 id="arch-attention" className="text-h3 font-semibold">
          Decisions to revisit
        </h2>
        <p className="mt-0.5 text-caption text-muted-foreground">
          Accepted decisions whose recorded revisit date has passed (revisit-v1). “Stale critical”
          ones also govern a component you marked critical. Age alone never flags a decision.
        </p>
      </header>
      <div className="p-4">
        {items.length === 0 ? (
          <p className="text-muted-foreground">No accepted decision is past its revisit date.</p>
        ) : (
          <ul className="divide-y">
            {items.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <Link
                  href={`/architecture/${d.id}` as never}
                  className="font-medium hover:underline"
                >
                  {d.title}
                </Link>
                <span className="flex flex-wrap items-center gap-1">
                  {d.kind === "stale" && <Badge tone="danger">Stale critical</Badge>}
                  <span className="text-caption text-muted-foreground tabular">
                    due {formatDate(d.revisitDate)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function AnalyticsBody() {
  const query = useApiGet<{ data: ArchitectureAnalyticsDto }>(
    ["architecture", "analytics"],
    "/api/v1/analytics/architecture",
  );
  if (query.isPending) return <ListSkeleton rows={6} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const data = query.data.data;
  const none = { from: null, to: null };
  const kpi = (m: MetricResult) => metricHref(m.key, {}, none);
  const cov = data.projectCoverage;
  const b = (m: MetricResult, i: number) => m.breakdown?.[i]?.value ?? 0;

  if (data.recordCounts.decisions === 0 && data.recordCounts.components === 0) {
    return (
      <div className="rounded-lg border bg-surface p-6">
        <h2 className="text-h3 font-semibold">No architecture records yet.</h2>
        <p className="mt-1 max-w-prose text-muted-foreground">
          Architecture analytics appear once you document decisions or register components. Nothing
          is inferred from projects or technologies.
        </p>
        <Link href="/architecture" className="mt-2 inline-block underline underline-offset-4">
          Go to decisions
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="arch-kpis">
        <h2 id="arch-kpis" className="sr-only">
          Architecture indicators
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard metric={data.decisions} href={kpi(data.decisions)} />
          <KpiCard metric={data.inForce} href={kpi(data.inForce)} />
          <KpiCard metric={data.revisitDue} href={kpi(data.revisitDue)} />
          <KpiCard metric={data.staleCritical} href={kpi(data.staleCritical)} />
          <KpiCard
            metric={cov}
            href={kpi(cov)}
            format={percent}
            detail={cov.breakdown ? `${b(cov, 0)} of ${b(cov, 0) + b(cov, 1)} projects` : null}
          />
          <KpiCard metric={data.components} href={kpi(data.components)} />
        </div>
      </section>
      <section aria-labelledby="arch-gaps">
        <h2 id="arch-gaps" className="mb-2 text-h3 font-semibold">
          Missing architecture knowledge
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <KpiCard metric={data.withGaps} href={kpi(data.withGaps)} />
          <KpiCard metric={data.withoutEvidence} href={kpi(data.withoutEvidence)} />
          <KpiCard
            metric={data.componentsWithoutDecisions}
            href={kpi(data.componentsWithoutDecisions)}
          />
          <KpiCard metric={data.critical} href={kpi(data.critical)} />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Distribution
          data={data}
          metric={data.status}
          title="Decisions by status"
          interpretation={`${data.recordCounts.decisions} decisions, including superseded and rejected history.`}
          colors={(p, key) => p[STATUS_COLOR[key] ?? "neutral"]}
          csvName="decisions-by-status"
          emptyText="No decisions."
        />
        <AttentionList data={data} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Distribution
          data={data}
          metric={data.timeline}
          title="Architecture decision timeline"
          interpretation="Decisions per month of their recorded decision date. Proposals have no date and are not shown."
          colors={(p) => p.brand}
          csvName="decision-timeline"
          emptyText="No decisions."
        />
        <Distribution
          data={data}
          metric={data.componentTypes}
          title="Components by type"
          interpretation={`${data.recordCounts.components} components in the registry.`}
          colors={(p) => p.brand}
          csvName="components-by-type"
          emptyText="No components."
        />
      </div>
      <p className="text-caption text-muted-foreground">
        No architecture quality score exists: gaps are listed per decision, coverage counts explicit
        decision links only, and criticality is your own flag.{" "}
        <Link href="/command-center/metrics" className="underline underline-offset-4">
          See the metric catalogue
        </Link>
        .
      </p>
    </div>
  );
}

export function ArchitectureAnalyticsView() {
  return (
    <MetricDefinitionProvider>
      <AnalyticsBody />
    </MetricDefinitionProvider>
  );
}
