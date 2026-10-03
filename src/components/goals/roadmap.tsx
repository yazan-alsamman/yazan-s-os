"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";

import { formatDate } from "@/components/data/detail";
import { ErrorState, ListSkeleton } from "@/components/data/states";
import { useUrlState } from "@/components/data/use-url-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApiGet } from "@/lib/api/hooks";
import { withQuery } from "@/lib/http/fetch-json";
import { cn } from "@/lib/ui/cn";
import { GOAL_TYPE_LABEL } from "@/modules/goals/goal.rules";
import type { RoadmapDto } from "@/modules/goals/roadmap.service";

import { GoalStatusBadge, RiskBadge } from "./goals-list";

type TimelineItem = RoadmapDto["timeline"][number];
type TreeNode = RoadmapDto["tree"][number];

function Block({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="rounded-lg border bg-surface">
      <header className="border-b px-4 py-3">
        <h2 id={`${id}-title`} className="text-h3 font-semibold">
          {title}
        </h2>
        <p className="mt-0.5 text-caption text-muted-foreground">{description}</p>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function WindowControls({ data }: { data: RoadmapDto | undefined }) {
  const { get, set } = useUrlState();
  const fromId = useId();
  const toId = useId();
  return (
    <section
      aria-label="Roadmap window"
      className="mb-5 flex flex-wrap items-end gap-2 rounded-lg border bg-surface p-3"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={fromId} className="text-caption text-muted-foreground">
          From
        </label>
        <Input
          id={fromId}
          type="date"
          value={get("from") || data?.window.from || ""}
          onChange={(e) => set({ from: e.target.value || null })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={toId} className="text-caption text-muted-foreground">
          To
        </label>
        <Input
          id={toId}
          type="date"
          value={get("to") || data?.window.to || ""}
          onChange={(e) => set({ to: e.target.value || null })}
        />
      </div>
      {(get("from") || get("to")) && (
        <Button variant="outline" onClick={() => set({ from: null, to: null })}>
          Reset window
        </Button>
      )}
      <p className="text-caption text-muted-foreground">
        Dates are UTC calendar days; quarters are calendar quarters. Default: the previous quarter
        through the next six. At most 5 years.
      </p>
    </section>
  );
}

/** What a goal shows in one quarter column: only real dates, never an invented span. */
function cellFor(g: TimelineItem, q: RoadmapDto["quarters"][number]): string | null {
  const inQ = (d: string | null) => d !== null && d >= q.from && d <= q.to;
  const parts: string[] = [];
  if (inQ(g.startDate)) parts.push(`Starts ${formatDate(g.startDate)}`);
  if (inQ(g.deadline)) parts.push(`Due ${formatDate(g.deadline)}`);
  if (parts.length) return parts.join(" · ");
  if (g.startDate && g.deadline && g.startDate < q.from && g.deadline > q.to) return "In progress";
  return null;
}

function Timeline({ data }: { data: RoadmapDto }) {
  const before = (g: TimelineItem) => g.deadline !== null && g.deadline < data.window.from;
  return (
    <Block
      id="timeline"
      title={`Timeline (${data.timeline.length})`}
      description="Goals with a start or deadline in the window, plus overdue goals. A span is shown only between a recorded start and deadline."
    >
      {data.timeline.length === 0 ? (
        <p className="text-muted-foreground">
          No goal has a start date or deadline in this window. Undated goals are listed below.
        </p>
      ) : (
        <div
          className="relative overflow-x-auto"
          role="region"
          aria-label="Roadmap timeline table (scrolls horizontally)"
          tabIndex={0}
        >
          <table className="w-full min-w-[48rem] border-collapse text-body">
            <caption className="sr-only">
              Goals by quarter from {formatDate(data.window.from)} to {formatDate(data.window.to)}
            </caption>
            <thead className="text-caption text-muted-foreground">
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-surface py-1 pr-3 text-left font-medium"
                >
                  Goal
                </th>
                {data.quarters.map((q) => (
                  <th key={q.key} scope="col" className="px-1 py-1 text-left font-medium">
                    {q.key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.timeline.map((g) => (
                <tr key={g.id}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 max-w-56 bg-surface py-1.5 pr-3 text-left align-top font-normal"
                  >
                    <Link href={`/goals/${g.id}` as never} className="font-medium hover:underline">
                      {g.title}
                    </Link>
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      <GoalStatusBadge status={g.status} />
                      {g.overdue && <Badge tone="danger">Overdue</Badge>}
                    </span>
                    {before(g) && (
                      <span className="block text-caption text-muted-foreground">
                        Deadline {formatDate(g.deadline)} is before the window
                      </span>
                    )}
                  </th>
                  {data.quarters.map((q) => {
                    const text = cellFor(g, q);
                    return (
                      <td key={q.key} className="px-1 py-1.5 align-top">
                        {text && (
                          <span
                            className={cn(
                              "block rounded-md border px-1.5 py-1 text-caption",
                              g.overdue && g.deadline && g.deadline >= q.from && g.deadline <= q.to
                                ? "border-danger/40 bg-danger/10"
                                : g.status === "completed"
                                  ? "border-success/40 bg-success/10"
                                  : "border-info/40 bg-info/10",
                            )}
                          >
                            {text}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.truncated && (
        <p className="mt-2 text-caption text-muted-foreground">
          Showing the first {data.timeline.length} goals; narrow the window to see the rest.
        </p>
      )}
    </Block>
  );
}

function QuarterBoard({ data }: { data: RoadmapDto }) {
  const byQuarter = new Map<string, TimelineItem[]>();
  for (const g of data.timeline) {
    if (!g.quarter) continue;
    byQuarter.set(g.quarter, [...(byQuarter.get(g.quarter) ?? []), g]);
  }
  return (
    <Block
      id="quarter-board"
      title="Quarter board"
      description="Goals grouped by the calendar quarter of their deadline."
    >
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data.quarters.map((q) => {
          const items = byQuarter.get(q.key) ?? [];
          return (
            <li key={q.key} className="rounded-md border bg-surface-sunken/40 p-3">
              <h3 className="text-body font-semibold">
                {q.key}{" "}
                <span className="text-caption font-normal text-muted-foreground">
                  ({items.length} {items.length === 1 ? "goal" : "goals"})
                </span>
              </h3>
              {items.length === 0 ? (
                <p className="mt-1 text-caption text-muted-foreground">No deadlines.</p>
              ) : (
                <ul className="mt-1 flex flex-col gap-1.5">
                  {items.map((g) => (
                    <li key={g.id} className="rounded-md border bg-surface p-2">
                      <Link
                        href={`/goals/${g.id}` as never}
                        className="font-medium hover:underline"
                      >
                        {g.title}
                      </Link>
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        <GoalStatusBadge status={g.status} />
                        <RiskBadge state={g.risk.state} />
                        <span className="text-caption text-muted-foreground tabular">
                          Due {formatDate(g.deadline)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </Block>
  );
}

function TreeList({
  nodes,
  childrenOf,
  depth,
}: {
  nodes: TreeNode[];
  childrenOf: Map<string, TreeNode[]>;
  depth: number;
}) {
  return (
    <ul className={cn("flex flex-col gap-1", depth > 0 && "mt-1 ml-4 border-l pl-3")}>
      {nodes.map((n) => {
        const kids = childrenOf.get(n.id) ?? [];
        return (
          <li key={n.id}>
            <span className="flex flex-wrap items-center gap-1.5">
              <Link href={`/goals/${n.id}` as never} className="font-medium hover:underline">
                {n.title}
              </Link>
              <Badge>{GOAL_TYPE_LABEL[n.type]}</Badge>
              <GoalStatusBadge status={n.status} />
              {n.deadline && (
                <span className="text-caption text-muted-foreground tabular">
                  Due {formatDate(n.deadline)}
                </span>
              )}
            </span>
            {kids.length > 0 && <TreeList nodes={kids} childrenOf={childrenOf} depth={depth + 1} />}
          </li>
        );
      })}
    </ul>
  );
}

function GoalTree({ data }: { data: RoadmapDto }) {
  const ids = new Set(data.tree.map((n) => n.id));
  const childrenOf = new Map<string, TreeNode[]>();
  const roots: TreeNode[] = [];
  for (const n of data.tree) {
    if (n.parentId && ids.has(n.parentId)) {
      childrenOf.set(n.parentId, [...(childrenOf.get(n.parentId) ?? []), n]);
    } else roots.push(n);
  }
  return (
    <Block
      id="goal-tree"
      title="Goal tree"
      description="North Star → Annual objective → Quarterly goal, as you linked them. At most three levels."
    >
      {roots.length === 0 ? (
        <p className="text-muted-foreground">No goals yet.</p>
      ) : (
        <TreeList nodes={roots} childrenOf={childrenOf} depth={0} />
      )}
    </Block>
  );
}

function Dependencies({ data }: { data: RoadmapDto }) {
  const title = new Map(data.tree.map((n) => [n.id, n.title]));
  return (
    <Block
      id="dependencies"
      title={`Dependencies (${data.dependencies.length})`}
      description="Each row reads “goal depends on goal”. Cycles are rejected when links are saved."
    >
      {data.dependencies.length === 0 ? (
        <p className="text-muted-foreground">No goal dependencies are recorded.</p>
      ) : (
        <ul className="divide-y">
          {data.dependencies.map((e) => (
            <li
              key={`${e.goalId}-${e.dependsOnGoalId}`}
              className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5"
            >
              <Link href={`/goals/${e.goalId}` as never} className="font-medium hover:underline">
                {title.get(e.goalId)}
              </Link>
              <span className="text-caption text-muted-foreground">depends on</span>
              <Link
                href={`/goals/${e.dependsOnGoalId}` as never}
                className="font-medium hover:underline"
              >
                {title.get(e.dependsOnGoalId)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}

function Undated({ data }: { data: RoadmapDto }) {
  return (
    <Block
      id="undated"
      title={`Open goals without a deadline (${data.undated.count})`}
      description="These cannot be placed on the timeline. Add a deadline to schedule them."
    >
      {data.undated.count === 0 ? (
        <p className="text-muted-foreground">Every open goal has a deadline.</p>
      ) : (
        <>
          <ul className="divide-y">
            {data.undated.items.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <Link href={`/goals/${g.id}` as never} className="font-medium hover:underline">
                  {g.title}
                </Link>
                <GoalStatusBadge status={g.status} />
              </li>
            ))}
          </ul>
          {data.undated.count > data.undated.items.length && (
            <Link
              href="/goals?open=true&hasDeadline=false"
              className="mt-2 inline-block text-caption underline underline-offset-4"
            >
              View all {data.undated.count}
            </Link>
          )}
        </>
      )}
    </Block>
  );
}

export function RoadmapView() {
  const { get } = useUrlState();
  const params = { from: get("from") || undefined, to: get("to") || undefined };
  const query = useApiGet<{ data: RoadmapDto }>(
    ["goals", "roadmap", params],
    withQuery("/api/v1/goals/roadmap", params),
  );
  const data = query.data?.data;
  return (
    <>
      <WindowControls data={data} />
      {query.isPending ? (
        <ListSkeleton rows={6} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : data!.tree.length === 0 ? (
        <div className="rounded-lg border bg-surface p-6">
          <h2 className="text-h3 font-semibold">No goals yet.</h2>
          <p className="mt-1 max-w-prose text-muted-foreground">
            The roadmap is built only from your goals&apos; recorded dates and links.
          </p>
          <Link href="/goals" className="mt-2 inline-block underline underline-offset-4">
            Go to goals
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-caption text-muted-foreground">
            Window {formatDate(data!.window.from)} – {formatDate(data!.window.to)} · evaluated{" "}
            {formatDate(data!.evaluatedOn)} (UTC)
          </p>
          <Timeline data={data!} />
          <QuarterBoard data={data!} />
          <div className="grid gap-4 xl:grid-cols-2">
            <GoalTree data={data!} />
            <div className="flex flex-col gap-4">
              <Undated data={data!} />
              <Dependencies data={data!} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
