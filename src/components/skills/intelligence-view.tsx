"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId } from "react";

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
import { ErrorState, ListSkeleton } from "@/components/data/states";
import { useUrlState } from "@/components/data/use-url-state";
import { percent } from "@/components/projects/dossier";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { useApiGet, type PageInfo } from "@/lib/api/hooks";
import { withQuery } from "@/lib/http/fetch-json";
import type { MetricResult } from "@/modules/analytics/metric-result";
import type { SkillsAnalyticsDto } from "@/modules/analytics/skills-analytics.service";
import type { SkillIntelligenceRow } from "@/modules/skills/skill-intelligence.service";

import { FRESHNESS_LABEL, FRESHNESS_TONE, GAP_LABEL, TREND_LABEL } from "./skill-dossier";

const FRESH_COLOR: Record<string, keyof ChartPalette> = {
  fresh: "success",
  aging: "warning",
  stale: "danger",
  no_dated_evidence: "neutral",
  no_evidence: "neutral",
};
const GAP_COLOR: Record<string, keyof ChartPalette> = {
  below_target: "warning",
  at_target: "success",
  above_target: "brand",
  not_computable: "neutral",
  no_target: "neutral",
};

function Meta({ data, metric }: { data: SkillsAnalyticsDto; metric: MetricResult }) {
  return (
    <>
      {[
        "Current state",
        `Source: ${metric.source.join(", ")}`,
        metric.filtersApplied.length ? `Filters: ${metric.filtersApplied.join(", ")}` : null,
        `Evaluated ${formatDate(data.evaluatedOn)} (UTC)`,
      ]
        .filter(Boolean)
        .join(" · ")}
    </>
  );
}

function Distribution({
  data,
  metric,
  title,
  interpretation,
  colors,
  category,
}: {
  data: SkillsAnalyticsDto;
  metric: MetricResult;
  title: string;
  interpretation: string;
  colors: (p: ChartPalette, key: string) => string;
  category: string | undefined;
}) {
  const router = useRouter();
  const showDefinition = useShowDefinition();
  const buckets = metric.breakdown ?? [];
  const hrefFor = (key: string) => bucketHref(metric.key, key, { skillCategory: category });
  const hasData = metric.state === "ok";
  return (
    <ChartCard
      title={title}
      interpretation={hasData ? interpretation : null}
      meta={<Meta data={data} metric={metric} />}
      onShowDefinition={() => showDefinition(metric.key)}
      csvName={metric.key.replace(/\W/g, "-")}
      table={hasData ? distributionTable(metric, hrefFor) : null}
      empty={
        hasData ? undefined : (
          <p className="p-4 text-muted-foreground">{metric.stateReason ?? "No active skills."}</p>
        )
      }
    >
      <EChart
        dataKey={JSON.stringify(buckets)}
        height={Math.max(150, buckets.length * 30)}
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

function Radar({ data }: { data: SkillsAnalyticsDto }) {
  const showDefinition = useShowDefinition();
  const r = data.radar;
  const axes = r.axes;
  // Draw the target series only when every axis has a target: a missing target is never plotted.
  const hasTargets = axes.length > 0 && axes.every((a) => a.target !== null);
  const someTargets = axes.some((a) => a.target !== null);
  const usable = axes.length >= 3;
  return (
    <ChartCard
      title="Skill radar"
      interpretation={
        axes.length
          ? `${axes.length} skills with an evidence-derived level${hasTargets ? ", shown against their targets" : ""}.`
          : null
      }
      meta={<Meta data={data} metric={r} />}
      onShowDefinition={() => showDefinition(r.key)}
      csvName="skill-radar"
      table={
        axes.length
          ? {
              caption: "Evidence-derived level and target per skill",
              columns: ["Derived level", "Target"],
              rows: axes.map((a) => ({
                label: a.name,
                values: [
                  `${a.current} (${a.currentLabel})`,
                  a.target === null ? "—" : `${a.target} (${a.targetLabel})`,
                ],
                href: `/skills/${a.id}`,
              })),
            }
          : null
      }
      empty={
        axes.length === 0 ? (
          <p className="p-4 text-muted-foreground">
            {r.stateReason ?? "No active skill has an evidence-derived level yet."}
          </p>
        ) : undefined
      }
    >
      {usable ? (
        <EChart
          dataKey={JSON.stringify(axes)}
          height={320}
          ariaLabel={`Radar chart of evidence-derived levels${hasTargets ? " and targets" : ""}: ${axes
            .map(
              (a) =>
                `${a.name} level ${a.current}${a.target !== null ? `, target ${a.target}` : ""}`,
            )
            .join("; ")}.`}
          option={(p) => ({
            tooltip: { trigger: "item" },
            legend: { bottom: 0, textStyle: { color: p.text } },
            radar: {
              indicator: axes.map((a) => ({ name: a.name, max: 5, min: 0 })),
              // Leave room for axis names on narrow screens (labels are truncated, the table is complete).
              radius: "50%",
              splitNumber: 5,
              axisName: { color: p.text, overflow: "truncate", width: 80 },
              splitLine: { lineStyle: { color: p.grid } },
              axisLine: { lineStyle: { color: p.grid } },
            },
            series: [
              {
                type: "radar",
                data: [
                  {
                    name: "Evidence-derived level",
                    value: axes.map((a) => a.current),
                    itemStyle: { color: p.brand },
                    areaStyle: { opacity: 0.15 },
                    symbol: "circle",
                  },
                  ...(hasTargets
                    ? [
                        {
                          name: "Target",
                          value: axes.map((a) => a.target!),
                          itemStyle: { color: p.warning },
                          lineStyle: { type: "dashed" as const },
                          symbol: "rect",
                        },
                      ]
                    : []),
                ],
              },
            ],
          })}
        />
      ) : (
        <p className="text-body text-muted-foreground">
          A radar needs at least 3 skills with a derived level — see the data table.
        </p>
      )}
      {someTargets && !hasTargets && (
        <p className="text-caption text-muted-foreground">
          Targets are not drawn because some plotted skills have none — see the data table.
        </p>
      )}
      {(r.omitted.withoutLevel > 0 || r.omitted.beyondLimit > 0) && (
        <p className="text-caption text-muted-foreground">
          Not plotted (missing data is never drawn as 0):{" "}
          {r.omitted.withoutLevel > 0 &&
            `${r.omitted.withoutLevel} skill${r.omitted.withoutLevel === 1 ? "" : "s"} without an evidence-derived level (${r.omitted.withoutLevelNames.map((s) => s.name).join(", ")}${r.omitted.withoutLevel > r.omitted.withoutLevelNames.length ? ", …" : ""})`}
          {r.omitted.withoutLevel > 0 && r.omitted.beyondLimit > 0 && "; "}
          {r.omitted.beyondLimit > 0 && `${r.omitted.beyondLimit} beyond the 12-skill limit`}.
        </p>
      )}
    </ChartCard>
  );
}

const FILTERS: { name: string; label: string; options: [string, string][] }[] = [
  { name: "gap", label: "Gap", options: Object.entries(GAP_LABEL) },
  { name: "freshness", label: "Freshness", options: Object.entries(FRESHNESS_LABEL) },
  {
    name: "level",
    label: "Derived level",
    options: [
      ["5", "5"],
      ["4", "4"],
      ["3", "3"],
      ["2", "2"],
      ["1", "1"],
      ["none", "Not enough evidence"],
    ],
  },
  { name: "trend", label: "Trend", options: Object.entries(TREND_LABEL) },
  {
    name: "critical",
    label: "Critical gap",
    options: [
      ["true", "Yes"],
      ["false", "No"],
    ],
  },
  {
    name: "hasTarget",
    label: "Has target",
    options: [
      ["true", "Yes"],
      ["false", "No"],
    ],
  },
  {
    name: "productionLinked",
    label: "Production evidence",
    options: [
      ["true", "Yes"],
      ["false", "No"],
    ],
  },
  {
    name: "active",
    label: "Active",
    options: [
      ["true", "Yes"],
      ["false", "No"],
    ],
  },
];
const EXTRA = ["targetWithoutEvidence"] as const;
const SORTS = [
  ["gap", "Largest gap first"],
  ["freshness", "Stalest first"],
  ["level", "Highest level"],
  ["evidence", "Most evidence"],
  ["name", "Name A–Z"],
] as const;

function FilterSelect({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: readonly (readonly [string, string])[];
}) {
  const id = useId();
  const { get, set } = useUrlState();
  return (
    <div className="flex min-w-36 flex-1 flex-col gap-1 sm:flex-none">
      <label htmlFor={id} className="text-caption text-muted-foreground">
        {label}
      </label>
      <NativeSelect
        id={id}
        value={get(name)}
        onChange={(e) => set({ [name]: e.target.value || null, page: null })}
      >
        <option value="">All</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

const cellTone: Record<string, string> = {
  success: "bg-success/15",
  warning: "bg-warning/20",
  danger: "bg-danger/15",
  neutral: "",
};

function gapText(r: SkillIntelligenceRow) {
  if (r.gap.value === null) return GAP_LABEL[r.gap.state]!;
  if (r.gap.value > 0) return `${r.gap.value} below`;
  if (r.gap.value === 0) return "At target";
  return `${-r.gap.value} above`;
}
const gapTone = (r: SkillIntelligenceRow) =>
  r.gap.critical
    ? "danger"
    : r.gap.state === "below_target"
      ? "warning"
      : r.gap.state === "at_target" || r.gap.state === "above_target"
        ? "success"
        : "neutral";

/** Skill gap heatmap (05): a semantic table — text in every cell, colour only as reinforcement. */
export function SkillHeatmap() {
  const { get, set } = useUrlState();
  const sortId = useId();
  const keys = ["category", ...FILTERS.map((f) => f.name), ...EXTRA, "sort", "page"];
  const params = Object.fromEntries(keys.map((k) => [k, get(k) || undefined]));
  const query = useApiGet<{ data: SkillIntelligenceRow[]; page: PageInfo; evaluatedOn: string }>(
    ["skills", "intelligence-list", params],
    withQuery("/api/v1/skills/intelligence", { ...params, pageSize: 25 }),
  );
  const page = Number(get("page") || 1);
  const filtered = [...FILTERS.map((f) => f.name), ...EXTRA].some((k) => get(k));

  return (
    <section aria-labelledby="heatmap-title" className="rounded-lg border bg-surface">
      <header className="border-b px-4 py-3">
        <h2 id="heatmap-title" className="text-h3 font-semibold">
          Skill gap heatmap
        </h2>
        <p className="mt-0.5 text-body">
          Each row is a skill: evidence-derived level, target, gap, freshness and production
          evidence. This list is the source behind every skill metric on this page.
        </p>
        <p className="mt-1 text-caption text-muted-foreground">
          Source: SkillEvidence, Evidence, ProjectSkill, CertificationSkill · skill-level-v1,
          freshness-v1, gap-analysis-v1
          {query.data && ` · evaluated ${formatDate(query.data.evaluatedOn)} (UTC)`}
        </p>
      </header>
      <div
        className="flex flex-wrap items-end gap-2 border-b p-3"
        role="group"
        aria-label="Heatmap filters"
      >
        {FILTERS.map((f) => (
          <FilterSelect key={f.name} {...f} />
        ))}
        <div className="flex min-w-36 flex-col gap-1">
          <label htmlFor={sortId} className="text-caption text-muted-foreground">
            Sort
          </label>
          <NativeSelect
            id={sortId}
            value={get("sort") || "gap"}
            onChange={(e) => set({ sort: e.target.value === "gap" ? null : e.target.value })}
          >
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </div>
        {(filtered || get("sort")) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              set(
                Object.fromEntries(
                  [...FILTERS.map((f) => f.name), ...EXTRA, "sort", "page"].map((k) => [k, null]),
                ),
              )
            }
          >
            Clear filters
          </Button>
        )}
        {get("targetWithoutEvidence") && <Badge>Also filtered by: target without evidence</Badge>}
      </div>
      {query.isPending ? (
        <ListSkeleton rows={5} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <p className="p-4 text-muted-foreground">
          {filtered
            ? "No skills match these filters."
            : "No skills yet. Add skills and link evidence to see gaps."}
        </p>
      ) : (
        <>
          <div className="hidden md:block">
            <table className="w-full text-body">
              <caption className="sr-only">
                Skill gap heatmap: {query.data.page.total} skills, sorted by{" "}
                {SORTS.find(([v]) => v === (get("sort") || "gap"))?.[1]}
              </caption>
              <thead className="text-caption text-muted-foreground">
                <tr>
                  {[
                    "Skill",
                    "Derived level",
                    "Target",
                    "Gap",
                    "Freshness",
                    "Production evidence",
                    "Evidence",
                    "Trend",
                  ].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {query.data.data.map((r) => (
                  <tr key={r.id}>
                    <th scope="row" className="px-3 py-2 text-left font-medium">
                      <Link href={`/skills/${r.id}` as never} className="hover:underline">
                        {r.name}
                      </Link>
                      {r.category && (
                        <span className="block text-caption font-normal text-muted-foreground">
                          {r.category}
                        </span>
                      )}
                    </th>
                    <td className="px-3 py-2">
                      {r.current.level === null
                        ? "Not enough evidence"
                        : `${r.current.level} — ${r.current.label}`}
                    </td>
                    <td className="px-3 py-2">
                      {r.target.level === null || r.target.level < 1
                        ? "Not configured"
                        : `${r.target.level} — ${r.target.label}`}
                    </td>
                    <td className={`px-3 py-2 ${cellTone[gapTone(r)]}`}>
                      {gapText(r)}
                      {r.gap.critical && (
                        <span className="block text-caption font-semibold">Critical</span>
                      )}
                    </td>
                    <td className={`px-3 py-2 ${cellTone[FRESHNESS_TONE[r.freshness.state]]}`}>
                      {FRESHNESS_LABEL[r.freshness.state]}
                      {r.freshness.daysSince !== null && (
                        <span className="block text-caption">{r.freshness.daysSince} days</span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular">
                      {r.counts.productionLinked ? `Yes (${r.counts.productionLinked})` : "No"}
                    </td>
                    <td className="px-3 py-2 tabular">
                      {r.counts.evidence}
                      {r.counts.undated > 0 && (
                        <span className="block text-caption text-muted-foreground">
                          {r.counts.undated} undated
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{TREND_LABEL[r.trend]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y md:hidden" aria-label="Skill gaps">
            {query.data.data.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 px-4 py-3">
                <Link href={`/skills/${r.id}` as never} className="font-medium hover:underline">
                  {r.name}
                </Link>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-caption">
                  <dt className="text-muted-foreground">Derived level</dt>
                  <dd>
                    {r.current.level === null
                      ? "Not enough evidence"
                      : `${r.current.level} — ${r.current.label}`}
                  </dd>
                  <dt className="text-muted-foreground">Target</dt>
                  <dd>
                    {r.target.level === null || r.target.level < 1
                      ? "Not configured"
                      : r.target.level}
                  </dd>
                  <dt className="text-muted-foreground">Gap</dt>
                  <dd>
                    {gapText(r)}
                    {r.gap.critical && " · Critical"}
                  </dd>
                  <dt className="text-muted-foreground">Freshness</dt>
                  <dd>{FRESHNESS_LABEL[r.freshness.state]}</dd>
                  <dt className="text-muted-foreground">Production evidence</dt>
                  <dd>{r.counts.productionLinked ? "Yes" : "No"}</dd>
                </dl>
              </li>
            ))}
          </ul>
          {query.data.page.totalPages > 1 && (
            <nav
              aria-label="Heatmap pages"
              className="flex items-center justify-end gap-1 border-t px-4 py-2"
            >
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => set({ page: String(page - 1) })}
              >
                <ChevronLeft aria-hidden />
                Previous
              </Button>
              <span className="text-caption tabular">
                {page} / {query.data.page.totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= query.data.page.totalPages}
                onClick={() => set({ page: String(page + 1) })}
              >
                Next
                <ChevronRight aria-hidden />
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}

function CategoryFilter() {
  const id = useId();
  const { get, set } = useUrlState();
  const categories = useApiGet<{ data: { categories: string[] } }>(
    ["skills", "categories"],
    "/api/v1/skills/categories",
  );
  return (
    <section
      aria-label="Skill intelligence filters"
      className="mb-5 flex flex-wrap items-end gap-2 rounded-lg border bg-surface p-3"
    >
      <div className="flex min-w-48 flex-col gap-1">
        <label htmlFor={id} className="text-caption text-muted-foreground">
          Skill category
        </label>
        <NativeSelect
          id={id}
          value={get("category")}
          onChange={(e) => set({ category: e.target.value || null, page: null })}
        >
          <option value="">All</option>
          {(categories.data?.data.categories ?? []).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </NativeSelect>
      </div>
      <p className="text-caption text-muted-foreground">
        Levels are derived from linked evidence, projects and certifications — never self-assessed.
        Missing evidence is shown as missing, never as 0.
      </p>
    </section>
  );
}

function Summary() {
  const { get } = useUrlState();
  const category = get("category") || undefined;
  const query = useApiGet<{ data: SkillsAnalyticsDto }>(
    ["skills", "analytics", category],
    withQuery("/api/v1/analytics/skills", { category }),
  );
  if (query.isPending) return <ListSkeleton rows={4} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const d = query.data.data;
  const drill = { skillCategory: category };
  const period = { from: null, to: null };
  const c = d.coverage;
  const get2 = (m: MetricResult, k: string) => m.breakdown?.find((b) => b.key === k)?.value ?? 0;
  return (
    <div className="flex flex-col gap-4">
      {d.recordCounts.skills === 0 && (
        <section
          className="rounded-lg border border-dashed bg-surface p-5"
          aria-labelledby="si-empty"
        >
          <h2 id="si-empty" className="text-h2 font-semibold">
            Skill intelligence appears as you add skills and evidence
          </h2>
          <p className="mt-1 text-muted-foreground">
            Every level, gap and freshness value is derived from your own linked records — nothing
            is estimated or pre-filled.
          </p>
          <Link href="/skills" className="mt-2 inline-block underline underline-offset-4">
            Go to skills
          </Link>
        </section>
      )}
      <section aria-labelledby="si-kpis">
        <h2 id="si-kpis" className="sr-only">
          Skill metrics
        </h2>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <KpiCard
            metric={c}
            href={metricHref(c.key, drill, period)}
            format={percent}
            detail={
              c.breakdown
                ? `${c.breakdown[0]!.value} of ${c.breakdown[0]!.value + c.breakdown[1]!.value} target skills demonstrated in the last 365 days`
                : null
            }
          />
          <KpiCard metric={d.criticalGaps} href={metricHref(d.criticalGaps.key, drill, period)} />
          <KpiCard
            metric={d.targetsWithoutEvidence}
            href={metricHref(d.targetsWithoutEvidence.key, drill, period)}
          />
          <KpiCard
            metric={d.productionEvidence}
            href={metricHref(d.productionEvidence.key, drill, period)}
          />
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-2">
        <Radar data={d} />
        <Distribution
          data={d}
          metric={d.levels}
          title="Skills by derived level"
          interpretation={`${d.recordCounts.active - get2(d.levels, "none")} of ${d.recordCounts.active} active skills have an evidence-derived level.`}
          colors={(p, k) => (k === "none" ? p.neutral : p.brand)}
          category={category}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Distribution
          data={d}
          metric={d.gaps}
          title="Gap to target"
          interpretation={`${get2(d.gaps, "below_target")} below target, ${get2(d.gaps, "at_target") + get2(d.gaps, "above_target")} at or above; ${get2(d.gaps, "not_computable")} target${get2(d.gaps, "not_computable") === 1 ? "" : "s"} without evidence.`}
          colors={(p, k) => p[GAP_COLOR[k] ?? "neutral"]}
          category={category}
        />
        <Distribution
          data={d}
          metric={d.freshness}
          title="Skill freshness"
          interpretation={`${get2(d.freshness, "fresh")} fresh, ${get2(d.freshness, "aging")} aging, ${get2(d.freshness, "stale")} stale.`}
          colors={(p, k) => p[FRESH_COLOR[k] ?? "neutral"]}
          category={category}
        />
        <Distribution
          data={d}
          metric={d.trend}
          title="Demonstration trend"
          interpretation={`Last 12 months vs the 12 before; ${get2(d.trend, "insufficient_history")} with insufficient history.`}
          colors={(p, k) => (k === "insufficient_history" ? p.neutral : p.brand)}
          category={category}
        />
      </div>
    </div>
  );
}

export function SkillIntelligenceView() {
  return (
    <MetricDefinitionProvider>
      <CategoryFilter />
      <div className="flex flex-col gap-4">
        <Summary />
        <SkillHeatmap />
        <p className="text-caption text-muted-foreground">
          Learning velocity is not shown: PEOS has no learning records (Knowledge is not scheduled)
          —{" "}
          <Link href="/command-center/metrics" className="underline underline-offset-4">
            see the metric catalogue
          </Link>
          .
        </p>
      </div>
    </MetricDefinitionProvider>
  );
}
