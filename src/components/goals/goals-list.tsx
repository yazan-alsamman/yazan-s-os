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
import type { GoalsAnalyticsDto } from "@/modules/analytics/goals-analytics.service";
import type { MetricResult } from "@/modules/analytics/metric-result";
import type { GoalRow } from "@/modules/goals/goal-intelligence";
import { GOAL_TYPE_LABEL } from "@/modules/goals/goal.rules";

import {
  ATTAINMENT_LABEL,
  ATTAINMENT_OPTIONS,
  ATTAINMENT_TONE,
  GOAL_EDIT_FIELDS,
  GOAL_STATUS_LABEL,
  GOAL_STATUS_OPTIONS,
  GOAL_STATUS_TONE,
  GOAL_TYPE_OPTIONS,
  goalCreateFields,
  RISK_LABEL,
  RISK_OPTIONS,
  RISK_TONE,
} from "./options";

const yesNo = (value: string) => (value === "true" ? "yes" : "no");

export function GoalStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={GOAL_STATUS_TONE[status as keyof typeof GOAL_STATUS_TONE] ?? "neutral"}>
      {GOAL_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export function RiskBadge({ state }: { state: keyof typeof RISK_TONE }) {
  return <Badge tone={RISK_TONE[state]}>{RISK_LABEL[state]}</Badge>;
}

/** Goals list — the single drill-down source for every goal metric (ADR 0034). */
export function GoalsList() {
  return (
    <ResourceList<GoalRow>
      resource="goals"
      path="/api/v1/goals"
      singular="goal"
      plural="goals"
      related={["milestones", "projects", "skills", "analytics"]}
      rowLabel={(g) => g.title}
      detailHref={(g) => `/goals/${g.id}`}
      extraParams={[
        { name: "open", label: "Open (active or on hold)", format: yesNo },
        { name: "committed", label: "Committed (active, on hold or completed)", format: yesNo },
        { name: "overdue", label: "Overdue", format: yesNo },
        { name: "hasDeadline", label: "Has a deadline", format: yesNo },
        { name: "hasProjects", label: "Has projects", format: yesNo },
        { name: "hasSkills", label: "Has skills", format: yesNo },
        { name: "skillGap", label: "Skill below target", format: yesNo },
        { name: "root", label: "Top-level only", format: yesNo },
        { name: "parentId", label: "Child of", format: () => "selected goal" },
        { name: "projectId", label: "Linked project", format: () => "selected project" },
        { name: "skillId", label: "Linked skill", format: () => "selected skill" },
        { name: "deadlineFrom", label: "Deadline from" },
        { name: "deadlineTo", label: "Deadline to" },
        { name: "completedFrom", label: "Completed from" },
        { name: "completedTo", label: "Completed to" },
      ]}
      searchPlaceholder="Title, outcome, metric, description…"
      filters={[
        { name: "status", label: "Status", options: GOAL_STATUS_OPTIONS },
        { name: "type", label: "Level", options: GOAL_TYPE_OPTIONS },
        { name: "risk", label: "Risk", options: RISK_OPTIONS },
        { name: "attainment", label: "Attainment", options: ATTAINMENT_OPTIONS },
      ]}
      sortOptions={[
        { value: "deadline", label: "Deadline" },
        { value: "risk", label: "Risk first" },
        { value: "title", label: "Title A–Z" },
        { value: "status", label: "Status" },
        { value: "updatedAt", label: "Recently updated" },
      ]}
      defaultSort="deadline"
      fields={goalCreateFields()}
      editFields={GOAL_EDIT_FIELDS}
      empty={{
        title: "No goals yet.",
        body: "Add a North Star, an annual objective or a quarterly goal. Progress, attainment and risk are derived only from what you record — PEOS never shows sample goals.",
      }}
      columns={[
        { header: "Goal", cell: (g) => g.title },
        { header: "Level", cell: (g) => GOAL_TYPE_LABEL[g.type] },
        { header: "Status", cell: (g) => <GoalStatusBadge status={g.status} /> },
        {
          header: "Deadline",
          className: "tabular",
          cell: (g) =>
            g.deadline ? (
              <span className="inline-flex flex-wrap items-center gap-1">
                {formatDate(g.deadline)}
                {g.overdue && <Badge tone="danger">Overdue</Badge>}
              </span>
            ) : (
              <span className="text-muted-foreground">No deadline</span>
            ),
        },
        { header: "Risk", cell: (g) => <RiskBadge state={g.risk.state} /> },
        {
          header: "Attainment",
          cell: (g) => (
            <Badge tone={ATTAINMENT_TONE[g.attainment.state]}>
              {g.attainment.progress === null
                ? ATTAINMENT_LABEL[g.attainment.state]
                : `${ATTAINMENT_LABEL[g.attainment.state]} · ${percent(g.attainment.progress)}`}
            </Badge>
          ),
        },
        {
          header: "Links",
          cell: (g) => (
            <span className="text-caption text-muted-foreground tabular">
              {g.milestones.completed}/{g.milestones.total} milestones · {g.counts.projects}{" "}
              projects · {g.counts.skills} skills
            </span>
          ),
        },
      ]}
    />
  );
}

// ── Analytics ───────────────────────────────────────────────────────────────

export function useGoalsAnalytics() {
  return useApiGet<{ data: GoalsAnalyticsDto }>(["goals", "analytics"], "/api/v1/analytics/goals");
}

function Meta({ data, metric }: { data: GoalsAnalyticsDto; metric: MetricResult }) {
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

const RISK_COLOR: Record<string, keyof ChartPalette> = {
  at_risk: "danger",
  on_track: "success",
  not_assessable: "neutral",
};
const STATUS_COLOR: Record<string, keyof ChartPalette> = {
  draft: "neutral",
  active: "brand",
  on_hold: "warning",
  completed: "success",
  cancelled: "neutral",
};
const ATTAINMENT_COLOR: Record<string, keyof ChartPalette> = {
  attained: "success",
  in_progress: "brand",
  regressed: "danger",
  not_computable: "neutral",
};

function GoalDistribution({
  data,
  metric,
  title,
  interpretation,
  colors,
  csvName,
  emptyText,
}: {
  data: GoalsAnalyticsDto;
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

function AttentionList({ data }: { data: GoalsAnalyticsDto }) {
  return (
    <section aria-labelledby="goal-attention" className="rounded-lg border bg-surface">
      <header className="border-b px-4 py-3">
        <h2 id="goal-attention" className="text-h3 font-semibold">
          Goals at risk
        </h2>
        <p className="mt-0.5 text-caption text-muted-foreground">
          Open goals with at least one real risk signal, most signals first (goal-risk-v1). Signals
          are listed, never weighted.
        </p>
      </header>
      <div className="p-4">
        {data.attention.length === 0 ? (
          <p className="text-muted-foreground">
            {data.recordCounts.open === 0
              ? "No open goals, so nothing can be at risk."
              : "No open goal shows a risk signal."}
          </p>
        ) : (
          <ul className="divide-y">
            {data.attention.map((g) => (
              <li key={g.id} className="py-2">
                <Link href={`/goals/${g.id}` as never} className="font-medium hover:underline">
                  {g.title}
                </Link>
                {g.deadline && (
                  <span className="ml-2 text-caption text-muted-foreground tabular">
                    due {formatDate(g.deadline)}
                  </span>
                )}
                <ul className="mt-0.5 list-disc pl-5 text-caption text-muted-foreground">
                  {g.signals.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {data.attention.length > 0 && (
          <Link
            href={metricHref("goals.at_risk", {}, { from: null, to: null }) as never}
            className="mt-2 inline-block text-caption underline underline-offset-4"
          >
            All goals at risk
          </Link>
        )}
      </div>
    </section>
  );
}

function GoalsAnalyticsBody() {
  const query = useGoalsAnalytics();
  if (query.isPending) return <ListSkeleton rows={6} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const data = query.data.data;
  const noPeriod = { from: null, to: null };
  const kpi = (metric: MetricResult) => metricHref(metric.key, {}, noPeriod);
  const rate = data.completionRate;
  const att = data.attainment;
  const b = (m: MetricResult, i: number) => m.breakdown?.[i]?.value ?? 0;

  if (data.recordCounts.goals === 0) {
    return (
      <div className="rounded-lg border bg-surface p-6">
        <h2 className="text-h3 font-semibold">No goals yet.</h2>
        <p className="mt-1 max-w-prose text-muted-foreground">
          Goal analytics appear once you record goals. Nothing is estimated or filled in.
        </p>
        <Link href="/goals" className="mt-2 inline-block underline underline-offset-4">
          Go to goals
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="goal-kpis">
        <h2 id="goal-kpis" className="sr-only">
          Goal indicators
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard metric={data.total} href={kpi(data.total)} />
          <KpiCard metric={data.active} href={kpi(data.active)} />
          <KpiCard metric={data.overdue} href={kpi(data.overdue)} />
          <KpiCard metric={data.atRisk} href={kpi(data.atRisk)} />
          <KpiCard
            metric={rate}
            href={kpi(rate)}
            format={percent}
            detail={
              rate.breakdown
                ? `${b(rate, 0)} completed of ${b(rate, 0) + b(rate, 1)} completed or overdue`
                : null
            }
          />
          <KpiCard
            metric={att}
            href={kpi(att)}
            format={percent}
            detail={
              att.breakdown
                ? `${b(att, 0)} attained of ${b(att, 0) + b(att, 1)} measurable committed goals`
                : null
            }
          />
        </div>
      </section>
      <section aria-labelledby="goal-coverage">
        <h2 id="goal-coverage" className="mb-2 text-h3 font-semibold">
          Open goals missing connections
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <KpiCard metric={data.withoutDeadline} href={kpi(data.withoutDeadline)} />
          <KpiCard metric={data.withoutProjects} href={kpi(data.withoutProjects)} />
          <KpiCard metric={data.withoutSkills} href={kpi(data.withoutSkills)} />
          <KpiCard metric={data.withSkillGaps} href={kpi(data.withSkillGaps)} />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <GoalDistribution
          data={data}
          metric={data.risk}
          title="Open goals by risk"
          interpretation={`${b(data.risk, 0)} of ${data.recordCounts.open} open goals show at least one risk signal.`}
          colors={(p, key) => p[RISK_COLOR[key] ?? "neutral"]}
          csvName="goals-by-risk"
          emptyText="No open goals."
        />
        <AttentionList data={data} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <GoalDistribution
          data={data}
          metric={data.load}
          title="Deadline load (open goals)"
          interpretation="Open goals by deadline quarter; overdue and undated goals are shown separately."
          colors={(p, key) => (key === "overdue" ? p.danger : key === "none" ? p.neutral : p.brand)}
          csvName="goal-deadline-load"
          emptyText="No open goals."
        />
        <GoalDistribution
          data={data}
          metric={data.status}
          title="Goals by status"
          interpretation={`${data.recordCounts.goals} goals in total.`}
          colors={(p, key) => p[STATUS_COLOR[key] ?? "neutral"]}
          csvName="goals-by-status"
          emptyText="No goals."
        />
      </div>
      <GoalDistribution
        data={data}
        metric={data.attainmentStates}
        title="Target attainment states (committed goals)"
        interpretation="Attainment needs a baseline, a target and at least one measurement; otherwise it is not computable — never 0 %."
        colors={(p, key) => p[ATTAINMENT_COLOR[key] ?? "neutral"]}
        csvName="goal-attainment-states"
        emptyText="No committed goals."
      />
      <p className="text-caption text-muted-foreground">
        No composite progress score is calculated: attainment, milestone progress and risk signals
        are shown separately.{" "}
        <Link href="/command-center/metrics" className="underline underline-offset-4">
          See the metric catalogue
        </Link>{" "}
        for every definition.
      </p>
    </div>
  );
}

export function GoalsAnalyticsView() {
  return (
    <MetricDefinitionProvider>
      <GoalsAnalyticsBody />
    </MetricDefinitionProvider>
  );
}
