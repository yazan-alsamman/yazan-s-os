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
import type { ExperimentsAnalyticsDto } from "@/modules/analytics/experiments-analytics.service";
import type { MetricResult } from "@/modules/analytics/metric-result";
import type { ExperimentRow } from "@/modules/experiments/experiment-intelligence";
import {
  EXPERIMENT_STATUS_LABEL,
  REPRODUCIBILITY_LABEL,
} from "@/modules/experiments/experiment.rules";

import {
  DECISION_OPTIONS,
  DECISION_TONE,
  EXPERIMENT_CREATE_FIELDS,
  EXPERIMENT_EDIT_FIELDS,
  REPRO_OPTIONS,
  REPRO_TONE,
  STATUS_OPTIONS,
  STATUS_TONE,
} from "./options";

const yesNo = (v: string) => (v === "true" ? "yes" : "no");

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={STATUS_TONE[status as keyof typeof STATUS_TONE] ?? "neutral"}>
      {EXPERIMENT_STATUS_LABEL[status as keyof typeof EXPERIMENT_STATUS_LABEL] ?? status}
    </Badge>
  );
}

export function DecisionBadge({ decision }: { decision: string | null }) {
  if (!decision) return <span className="text-muted-foreground">Undecided</span>;
  return (
    <Badge tone={DECISION_TONE[decision as keyof typeof DECISION_TONE] ?? "neutral"}>
      {decision.charAt(0).toUpperCase() + decision.slice(1)}
    </Badge>
  );
}

export function ReproBadge({ state }: { state: keyof typeof REPRO_TONE }) {
  return <Badge tone={REPRO_TONE[state]}>{REPRODUCIBILITY_LABEL[state]}</Badge>;
}

/** Experiments list — the single drill-down source for every AI Lab metric (ADR 0038). */
export function ExperimentsList() {
  return (
    <ResourceList<ExperimentRow>
      resource="experiments"
      path="/api/v1/experiments"
      singular="experiment"
      plural="experiments"
      related={["analytics", "projects", "evidence"]}
      rowLabel={(e) => e.title}
      detailHref={(e) => `/ai-lab/${e.id}`}
      extraParams={[
        { name: "open", label: "Open (planned or active)", format: yesNo },
        { name: "hasRuns", label: "Has runs", format: yesNo },
        { name: "hasEvaluation", label: "Has evaluation", format: yesNo },
        { name: "hasEvidence", label: "Has evidence", format: yesNo },
        { name: "category", label: "Category" },
        { name: "projectId", label: "Project", format: () => "selected project" },
        { name: "createdFrom", label: "Created from" },
        { name: "createdTo", label: "Created to" },
      ]}
      searchPlaceholder="Title, hypothesis, objective, result, category…"
      filters={[
        { name: "status", label: "Status", options: STATUS_OPTIONS },
        { name: "decision", label: "Decision", options: DECISION_OPTIONS },
        { name: "reproducibility", label: "Reproducibility", options: REPRO_OPTIONS },
      ]}
      sortOptions={[
        { value: "updatedAt", label: "Recently updated" },
        { value: "createdAt", label: "Newest" },
        { value: "title", label: "Title A–Z" },
        { value: "status", label: "Status" },
        { value: "runs", label: "Most runs" },
      ]}
      defaultSort="updatedAt"
      fields={EXPERIMENT_CREATE_FIELDS}
      editFields={EXPERIMENT_EDIT_FIELDS}
      empty={{
        title: "No experiments yet.",
        body: "Record an AI/ML experiment: its hypothesis, the runs you tried and the results you measured. PEOS stores what you record — it never runs models or invents results.",
      }}
      columns={[
        { header: "Experiment", cell: (e) => e.title },
        { header: "Status", cell: (e) => <StatusBadge status={e.status} /> },
        { header: "Decision", cell: (e) => <DecisionBadge decision={e.decision} /> },
        {
          header: "Runs",
          className: "tabular",
          cell: (e) =>
            e.runs.total === 0 ? (
              <span className="text-muted-foreground">No runs</span>
            ) : (
              `${e.runs.total} (${e.evaluation.runsWithMetrics} evaluated)`
            ),
        },
        { header: "Reproducibility", cell: (e) => <ReproBadge state={e.reproducibility} /> },
        {
          header: "Latest run",
          cell: (e) =>
            e.latest ? (
              <span className="text-caption text-muted-foreground">
                #{e.latest.runNumber} {e.latest.model ?? "model n/r"}
                {e.latest.costUsd !== null && ` · $${e.latest.costUsd}`}
                {e.latest.latencyMs !== null && ` · ${e.latest.latencyMs} ms`}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
      ]}
    />
  );
}

// ── Analytics ───────────────────────────────────────────────────────────────

export function useExperimentsAnalytics() {
  return useApiGet<{ data: ExperimentsAnalyticsDto }>(
    ["experiments", "analytics"],
    "/api/v1/analytics/experiments",
  );
}

function Meta({ data, metric }: { data: ExperimentsAnalyticsDto; metric: MetricResult }) {
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
  planned: "neutral",
  active: "brand",
  completed: "success",
  abandoned: "neutral",
};
const REPRO_COLOR: Record<string, keyof ChartPalette> = {
  reproducible: "success",
  partial: "warning",
  not_reproducible: "danger",
  unknown: "neutral",
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
  data: ExperimentsAnalyticsDto;
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

function Measure({ label, value, sub }: { label: string; value: ReactNode; sub: ReactNode }) {
  return (
    <div className="rounded-md border bg-surface-sunken/40 p-2.5">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-h3 font-semibold">{value}</dd>
      <dd className="text-caption text-muted-foreground">{sub}</dd>
    </div>
  );
}

function AnalyticsBody() {
  const query = useExperimentsAnalytics();
  if (query.isPending) return <ListSkeleton rows={6} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const data = query.data.data;
  const noPeriod = { from: null, to: null };
  const kpi = (m: MetricResult) => metricHref(m.key, {}, noPeriod);
  const b = (m: MetricResult, i: number) => m.breakdown?.[i]?.value ?? 0;
  const num = (v: number | null, digits = 2) =>
    v === null
      ? "—"
      : new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(v);

  if (data.recordCounts.experiments === 0) {
    return (
      <div className="rounded-lg border bg-surface p-6">
        <h2 className="text-h3 font-semibold">No experiments yet.</h2>
        <p className="mt-1 max-w-prose text-muted-foreground">
          AI Lab analytics appear once you record experiments. Nothing is estimated or fabricated.
        </p>
        <Link href="/ai-lab" className="mt-2 inline-block underline underline-offset-4">
          Go to experiments
        </Link>
      </div>
    );
  }
  const m = data.measurements;

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="ai-kpis">
        <h2 id="ai-kpis" className="sr-only">
          Experiment indicators
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard metric={data.total} href={kpi(data.total)} />
          <KpiCard metric={data.active} href={kpi(data.active)} />
          <KpiCard metric={data.completed} href={kpi(data.completed)} />
          <KpiCard metric={data.runsTotal} href={kpi(data.runsTotal)} />
          <KpiCard
            metric={data.adoptionRate}
            href={kpi(data.adoptionRate)}
            format={percent}
            detail={
              data.adoptionRate.breakdown
                ? `${b(data.adoptionRate, 0)} adopted of ${b(data.adoptionRate, 0) + b(data.adoptionRate, 1)} decided`
                : null
            }
          />
          <KpiCard
            metric={data.evaluationCoverage}
            href={kpi(data.evaluationCoverage)}
            format={percent}
            detail={
              data.evaluationCoverage.breakdown
                ? `${b(data.evaluationCoverage, 0)} of ${b(data.evaluationCoverage, 0) + b(data.evaluationCoverage, 1)} with runs`
                : null
            }
          />
        </div>
      </section>

      <section aria-labelledby="ai-gaps">
        <h2 id="ai-gaps" className="mb-2 text-h3 font-semibold">
          Record completeness
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
          <KpiCard metric={data.missingEvaluation} href={kpi(data.missingEvaluation)} />
          <KpiCard metric={data.missingProvenance} href={kpi(data.missingProvenance)} />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Distribution
          data={data}
          metric={data.status}
          title="Experiments by status"
          interpretation={`${data.recordCounts.experiments} experiments in total.`}
          colors={(p, key) => p[STATUS_COLOR[key] ?? "neutral"]}
          csvName="experiments-by-status"
          emptyText="No experiments."
        />
        <Distribution
          data={data}
          metric={data.reproducibility}
          title="Reproducibility (recorded metadata)"
          interpretation="How completely each experiment's runs record model, version, prompt, dataset and code — not a verified reproduction."
          colors={(p, key) => p[REPRO_COLOR[key] ?? "neutral"]}
          csvName="experiments-reproducibility"
          emptyText="No experiments."
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Distribution
          data={data}
          metric={data.decision}
          title="Experiments by decision"
          interpretation="Your own conclusions. Undecided experiments have no list filter."
          colors={(p) => p.brand}
          csvName="experiments-by-decision"
          emptyText="No experiments."
        />
        <Distribution
          data={data}
          metric={data.category}
          title="Experiments by category"
          interpretation="Free-text categories as you entered them."
          colors={(p) => p.brand}
          csvName="experiments-by-category"
          emptyText="No experiments."
        />
      </div>

      <section aria-labelledby="ai-measures" className="rounded-lg border bg-surface">
        <header className="border-b px-4 py-3">
          <h2 id="ai-measures" className="text-h3 font-semibold">
            Recorded run measurements
          </h2>
          <p className="mt-0.5 text-caption text-muted-foreground">
            Descriptive summaries of real recorded values only. Runs without a value are excluded —
            never counted as zero. Not governed KPIs.
          </p>
        </header>
        <dl className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-3">
          <Measure
            label="Cost (USD)"
            value={m.cost.avgUsd === null ? "Not recorded" : `avg $${num(m.cost.avgUsd)}`}
            sub={
              m.cost.recordedRuns === 0
                ? "No run records cost."
                : `total $${num(m.cost.sumUsd)} · ${m.cost.recordedRuns} of ${m.cost.totalRuns} runs`
            }
          />
          <Measure
            label="Latency (ms)"
            value={m.latency.avgMs === null ? "Not recorded" : `avg ${num(m.latency.avgMs, 0)} ms`}
            sub={
              m.latency.recordedRuns === 0
                ? "No run records latency."
                : `${m.latency.recordedRuns} of ${m.latency.totalRuns} runs`
            }
          />
          <Measure
            label="Tokens"
            value={m.tokens.total === null ? "Not recorded" : `${num(m.tokens.total, 0)} total`}
            sub={
              m.tokens.recordedRuns === 0
                ? "No run records tokens."
                : `${m.tokens.recordedRuns} of ${m.tokens.totalRuns} runs`
            }
          />
        </dl>
      </section>

      <p className="text-caption text-muted-foreground">
        No “AI success score” exists: adoption is your decision, reproducibility measures recorded
        metadata, and each evaluation metric keeps its own unit.{" "}
        <Link href="/command-center/metrics" className="underline underline-offset-4">
          See the metric catalogue
        </Link>
        .
      </p>
    </div>
  );
}

export function ExperimentsAnalyticsView() {
  return (
    <MetricDefinitionProvider>
      <AnalyticsBody />
    </MetricDefinitionProvider>
  );
}
