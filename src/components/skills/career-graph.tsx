"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo } from "react";

import { EChart, type ChartPalette } from "@/components/charts/echart";
import { ErrorState, ListSkeleton } from "@/components/data/states";
import { useUrlState } from "@/components/data/use-url-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { useApiGet } from "@/lib/api/hooks";
import { withQuery } from "@/lib/http/fetch-json";
import type { CareerGraphDto, NodeType } from "@/modules/analytics/career-graph.service";

const TYPES: {
  type: NodeType;
  label: string;
  plural: string;
  symbol: string;
  color: keyof ChartPalette;
}[] = [
  { type: "skill", label: "Skill", plural: "Skills", symbol: "circle", color: "brand" },
  { type: "project", label: "Project", plural: "Projects", symbol: "rect", color: "success" },
  {
    type: "technology",
    label: "Technology",
    plural: "Technologies",
    symbol: "diamond",
    color: "warning",
  },
  {
    type: "certification",
    label: "Certification",
    plural: "Certifications",
    symbol: "triangle",
    color: "danger",
  },
  {
    type: "experience",
    label: "Experience",
    plural: "Experiences",
    symbol: "roundRect",
    color: "neutral",
  },
  { type: "evidence", label: "Evidence", plural: "Evidence", symbol: "pin", color: "mutedText" },
];
const DEFAULT_TYPES = "skill,project,technology,certification";
const META = Object.fromEntries(TYPES.map((t) => [t.type, t])) as Record<
  NodeType,
  (typeof TYPES)[number]
>;

function Controls({ graph }: { graph?: CareerGraphDto }) {
  const { get, set } = useUrlState();
  const limitId = useId();
  const catId = useId();
  const types = new Set((get("types") || DEFAULT_TYPES).split(","));
  const categories = useApiGet<{ data: { categories: string[] } }>(
    ["skills", "categories"],
    "/api/v1/skills/categories",
  );
  const toggle = (t: NodeType) => {
    const next = new Set(types);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    const value = TYPES.map((x) => x.type)
      .filter((x) => next.has(x))
      .join(",");
    set({ types: value === DEFAULT_TYPES ? null : value || "skill" });
  };
  const focusNode = graph?.nodes.find((n) => n.focus);
  return (
    <section
      aria-label="Career graph controls"
      className="mb-4 flex flex-col gap-3 rounded-lg border bg-surface p-3"
    >
      <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
        <legend className="mb-1 text-caption text-muted-foreground">Show record types</legend>
        {TYPES.map((t) => (
          <label key={t.type} className="inline-flex items-center gap-1.5 text-body">
            <input
              type="checkbox"
              checked={types.has(t.type) || focusNode?.type === t.type}
              disabled={focusNode?.type === t.type}
              onChange={() => toggle(t.type)}
              className="size-4"
            />
            {t.plural}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-44 flex-col gap-1">
          <label htmlFor={catId} className="text-caption text-muted-foreground">
            Skill category (overview)
          </label>
          <NativeSelect
            id={catId}
            value={get("category")}
            onChange={(e) => set({ category: e.target.value || null })}
          >
            <option value="">All</option>
            {(categories.data?.data.categories ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex min-w-32 flex-col gap-1">
          <label htmlFor={limitId} className="text-caption text-muted-foreground">
            Maximum nodes
          </label>
          <NativeSelect
            id={limitId}
            value={get("limit") || "80"}
            onChange={(e) => set({ limit: e.target.value === "80" ? null : e.target.value })}
          >
            {["40", "80", "150"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </NativeSelect>
        </div>
        {focusNode && (
          <p className="flex flex-wrap items-center gap-2 text-body">
            Focused on <Badge>{META[focusNode.type].label}</Badge>{" "}
            <strong>{focusNode.label}</strong>
            <Button
              variant="outline"
              size="sm"
              onClick={() => set({ focusType: null, focusId: null })}
            >
              Back to overview
            </Button>
          </p>
        )}
      </div>
    </section>
  );
}

export function CareerGraphView() {
  const router = useRouter();
  const { get, set } = useUrlState();
  const params = {
    focusType: get("focusType") || undefined,
    focusId: get("focusId") || undefined,
    types: get("types") || undefined,
    category: get("category") || undefined,
    limit: get("limit") || undefined,
  };
  const query = useApiGet<{ data: CareerGraphDto }>(
    ["skills", "career-graph", params],
    withQuery("/api/v1/analytics/career-graph", params),
  );
  const graph = query.data?.data;
  const neighbours = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!graph) return map;
    const label = new Map(graph.nodes.map((n) => [n.id, n.label]));
    for (const e of graph.edges) {
      map.set(e.source, [...(map.get(e.source) ?? []), label.get(e.target) ?? ""]);
      map.set(e.target, [...(map.get(e.target) ?? []), label.get(e.source) ?? ""]);
    }
    return map;
  }, [graph]);

  return (
    <>
      <Controls graph={graph} />
      {query.isPending ? (
        <ListSkeleton rows={5} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : graph!.nodes.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-surface p-5">
          <h2 className="text-h2 font-semibold">No connections to show yet</h2>
          <p className="mt-1 text-muted-foreground">
            The career graph shows only real records and the relationships you created: link skills
            to projects, technologies, certifications and evidence to see it grow.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <section aria-labelledby="graph-title" className="rounded-lg border bg-surface">
            <header className="border-b px-4 py-3">
              <h2 id="graph-title" className="text-h3 font-semibold">
                {graph!.mode === "focus"
                  ? "Connections of the focused record"
                  : "Most-connected skills and their records"}
              </h2>
              <p className="mt-0.5 text-body">
                {graph!.nodes.length} records and {graph!.edges.length} relationships
                {graph!.truncated && ` — limited to ${graph!.limit} records`}. Every line is a
                relationship you recorded; nothing is inferred. Select a node to open the record.
              </p>
              <p className="mt-1 text-caption text-muted-foreground">
                Source: ProjectSkill, TechnologyUsage, ProjectEvidence, SkillEvidence,
                TechnologySkill, CertificationSkill, CertificationEvidence, ExperienceEvidence ·
                shapes: ● skill ■ project ◆ technology ▲ certification ▢ experience 📍 evidence
              </p>
            </header>
            <div className="p-2">
              <EChart
                dataKey={JSON.stringify([graph!.nodes.map((n) => n.id), graph!.edges.length])}
                height={480}
                ariaLabel={`Network graph of ${graph!.nodes.length} career records and ${graph!.edges.length} relationships. The table below lists every record and its connections.`}
                option={(p) => ({
                  tooltip: { formatter: "{b}" },
                  legend: {
                    bottom: 0,
                    type: "scroll",
                    itemGap: 20,
                    textStyle: { color: p.text },
                    data: TYPES.filter((t) => graph!.nodes.some((n) => n.type === t.type)).map(
                      (t) => t.plural,
                    ),
                  },
                  series: [
                    {
                      type: "graph",
                      layout: "force",
                      roam: true,
                      draggable: true,
                      animation: false,
                      force: { repulsion: 140, edgeLength: [40, 120], gravity: 0.08 },
                      categories: TYPES.map((t) => ({
                        name: t.plural,
                        symbol: t.symbol,
                        itemStyle: { color: p[t.color] },
                      })),
                      label: {
                        show: true,
                        position: "right",
                        color: p.text,
                        fontSize: 11,
                        width: 120,
                        overflow: "truncate",
                      },
                      lineStyle: { color: p.grid, width: 1, opacity: 0.9 },
                      emphasis: { focus: "adjacency" },
                      data: graph!.nodes.map((n) => ({
                        id: n.id,
                        name: n.label,
                        category: TYPES.findIndex((t) => t.type === n.type),
                        symbol: META[n.type].symbol,
                        symbolSize: (n.focus ? 22 : 10) + Math.min(14, n.degree * 2),
                      })),
                      links: graph!.edges.map((e) => ({ source: e.source, target: e.target })),
                    },
                  ],
                })}
                onSelect={(i) => {
                  const node = graph!.nodes[i];
                  if (node) router.push(node.href as never);
                }}
              />
            </div>
          </section>

          <section aria-labelledby="graph-table-title" className="rounded-lg border bg-surface">
            <header className="border-b px-4 py-3">
              <h2 id="graph-table-title" className="text-h3 font-semibold">
                Records and connections
              </h2>
              <p className="mt-0.5 text-caption text-muted-foreground">
                The same graph as a list: open a record, or focus the graph on it to see its direct
                connections.
              </p>
            </header>
            <ul className="divide-y" aria-label="Career graph records">
              {graph!.nodes.map((n) => (
                <li key={n.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2">
                  <Badge>{META[n.type].label}</Badge>
                  <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
                    <Link href={n.href as never} className="font-medium hover:underline">
                      {n.label}
                    </Link>
                    {n.focus && (
                      <span className="text-caption text-muted-foreground"> (focus)</span>
                    )}
                    <p className="text-caption text-muted-foreground">
                      {n.degree} connection{n.degree === 1 ? "" : "s"}
                      {neighbours.get(n.id)?.length
                        ? `: ${neighbours.get(n.id)!.slice(0, 8).join(", ")}${neighbours.get(n.id)!.length > 8 ? ", …" : ""}`
                        : ""}
                    </p>
                  </div>
                  {!n.focus && (
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Focus the graph on ${n.label}`}
                      onClick={() => set({ focusType: n.type, focusId: n.entityId })}
                    >
                      Focus
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
