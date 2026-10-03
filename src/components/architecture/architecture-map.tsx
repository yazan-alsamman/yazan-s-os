"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId } from "react";

import { EChart, type ChartPalette } from "@/components/charts/echart";
import { ErrorState, ListSkeleton } from "@/components/data/states";
import { useUrlState } from "@/components/data/use-url-state";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";
import { useApiGet } from "@/lib/api/hooks";
import { withQuery } from "@/lib/http/fetch-json";
import type { ArchitectureMapDto } from "@/modules/architecture/architecture-intelligence";
import { COMPONENT_TYPES } from "@/modules/architecture/architecture.rules";

import { COMPONENT_TYPE_LABEL, TYPE_OPTIONS } from "./options";

const TYPE_STYLE: Record<string, { symbol: string; color: keyof ChartPalette }> = {
  service: { symbol: "circle", color: "brand" },
  database: { symbol: "rect", color: "success" },
  queue: { symbol: "diamond", color: "warning" },
  external_api: { symbol: "triangle", color: "neutral" },
  ai_model: { symbol: "roundRect", color: "danger" },
  infrastructure: { symbol: "pin", color: "mutedText" },
};

function Controls() {
  const { get, set } = useUrlState();
  const typeId = useId();
  const limitId = useId();
  return (
    <section
      aria-label="Map controls"
      className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border bg-surface p-3"
    >
      <div className="flex min-w-36 flex-col gap-1">
        <label htmlFor={typeId} className="text-caption text-muted-foreground">
          Component type
        </label>
        <NativeSelect
          id={typeId}
          value={get("type")}
          onChange={(e) => set({ type: e.target.value || null })}
        >
          <option value="">All types</option>
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex min-w-36 flex-col gap-1">
        <label htmlFor={limitId} className="text-caption text-muted-foreground">
          Maximum components
        </label>
        <NativeSelect
          id={limitId}
          value={get("limit") || "100"}
          onChange={(e) => set({ limit: e.target.value === "100" ? null : e.target.value })}
        >
          {["25", "50", "100", "150"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </NativeSelect>
      </div>
      {get("projectId") && (
        <p className="text-caption text-muted-foreground">
          Filtered to one project.{" "}
          <button
            type="button"
            className="underline underline-offset-4"
            onClick={() => set({ projectId: null })}
          >
            Show all
          </button>
        </p>
      )}
    </section>
  );
}

export function ArchitectureMapView() {
  const router = useRouter();
  const { get } = useUrlState();
  const params = {
    type: get("type") || undefined,
    limit: get("limit") || undefined,
    projectId: get("projectId") || undefined,
  };
  const query = useApiGet<{ data: ArchitectureMapDto }>(
    ["architecture", "map", params],
    withQuery("/api/v1/architecture/map", params),
  );
  const map = query.data?.data;
  const names = new Map((map?.nodes ?? []).map((n) => [n.id, n.name]));

  return (
    <>
      <Controls />
      {query.isPending ? (
        <ListSkeleton rows={6} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : map!.nodes.length === 0 ? (
        <div className="rounded-lg border bg-surface p-6">
          <h2 className="text-h3 font-semibold">No components to show.</h2>
          <p className="mt-1 max-w-prose text-muted-foreground">
            The map draws only components you registered and the dependencies you recorded.
          </p>
          <Link
            href="/architecture/components"
            className="mt-2 inline-block underline underline-offset-4"
          >
            Go to components
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <section aria-labelledby="map-title" className="rounded-lg border bg-surface">
            <header className="border-b px-4 py-3">
              <h2 id="map-title" className="text-h3 font-semibold">
                Architecture map
              </h2>
              <p className="mt-0.5 text-body">
                {map!.nodes.length} components and {map!.edges.length} dependencies
                {map!.truncated &&
                  ` — showing ${map!.nodes.length} of ${map!.total} (critical first)`}
                . Every arrow is a dependency you recorded; nothing is inferred.
              </p>
              <p className="mt-1 text-caption text-muted-foreground">
                Source: ArchitectureComponent, ComponentDependency · shapes: ● service ■ database ◆
                queue ▲ external API ▢ AI model 📍 infrastructure · larger = critical
              </p>
            </header>
            <div className="p-2">
              <EChart
                dataKey={JSON.stringify([map!.nodes.map((n) => n.id), map!.edges.length])}
                height={480}
                ariaLabel={`Network graph of ${map!.nodes.length} architecture components and ${map!.edges.length} dependencies. The table below lists every component and dependency.`}
                option={(p) => ({
                  tooltip: { formatter: "{b}" },
                  legend: {
                    bottom: 0,
                    type: "scroll",
                    itemGap: 20,
                    textStyle: { color: p.text },
                    data: COMPONENT_TYPES.filter((t) => map!.nodes.some((n) => n.type === t)).map(
                      (t) => COMPONENT_TYPE_LABEL[t],
                    ),
                  },
                  series: [
                    {
                      type: "graph",
                      layout: "force",
                      roam: true,
                      draggable: true,
                      animation: false,
                      force: { repulsion: 160, edgeLength: [50, 130], gravity: 0.08 },
                      edgeSymbol: ["none", "arrow"],
                      edgeSymbolSize: 7,
                      categories: COMPONENT_TYPES.map((t) => ({
                        name: COMPONENT_TYPE_LABEL[t],
                        symbol: TYPE_STYLE[t]!.symbol,
                        itemStyle: { color: p[TYPE_STYLE[t]!.color] },
                      })),
                      label: {
                        show: true,
                        position: "right",
                        color: p.text,
                        fontSize: 11,
                        width: 120,
                        overflow: "truncate",
                      },
                      lineStyle: { color: p.mutedText, width: 1, opacity: 0.8 },
                      emphasis: { focus: "adjacency" },
                      data: map!.nodes.map((n) => ({
                        id: n.id,
                        name: n.name,
                        category: COMPONENT_TYPES.indexOf(n.type),
                        symbol: TYPE_STYLE[n.type]!.symbol,
                        symbolSize: n.critical ? 22 : 12,
                      })),
                      links: map!.edges.map((e) => ({ source: e.from, target: e.to })),
                    },
                  ],
                })}
                onSelect={(i) => {
                  const node = map!.nodes[i];
                  if (node) router.push(`/architecture/components/${node.id}` as never);
                }}
              />
            </div>
          </section>

          <section aria-labelledby="map-table-title" className="rounded-lg border bg-surface">
            <header className="border-b px-4 py-3">
              <h2 id="map-table-title" className="text-h3 font-semibold">
                Components and dependencies
              </h2>
              <p className="mt-0.5 text-caption text-muted-foreground">
                The same data as the map, as a table.
              </p>
            </header>
            <div
              className="relative overflow-x-auto p-4"
              role="region"
              aria-label="Component dependency table (scrolls horizontally on small screens)"
              tabIndex={0}
            >
              <table className="w-full min-w-[34rem] text-body">
                <caption className="sr-only">
                  Architecture components and what each depends on
                </caption>
                <thead className="text-caption text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-1 pr-3 text-left font-medium">
                      Component
                    </th>
                    <th scope="col" className="py-1 pr-3 text-left font-medium">
                      Type
                    </th>
                    <th scope="col" className="py-1 pr-3 text-left font-medium">
                      Depends on
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      Decisions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {map!.nodes.map((n) => {
                    const deps = map!.edges
                      .filter((e) => e.from === n.id)
                      .map((e) => names.get(e.to) ?? "?");
                    return (
                      <tr key={n.id}>
                        <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                          <Link
                            href={`/architecture/components/${n.id}` as never}
                            className="font-medium hover:underline"
                          >
                            {n.name}
                          </Link>
                          {n.critical && (
                            <Badge tone="danger" className="ml-2">
                              Critical
                            </Badge>
                          )}
                        </th>
                        <td className="py-1.5 pr-3">{COMPONENT_TYPE_LABEL[n.type]}</td>
                        <td className="py-1.5 pr-3">
                          {deps.length ? (
                            deps.join(", ")
                          ) : (
                            <span className="text-muted-foreground">None recorded</span>
                          )}
                        </td>
                        <td className="py-1.5 text-right tabular">{n.decisions}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
