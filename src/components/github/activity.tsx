"use client";

import { useState } from "react";

import { KpiCard } from "@/components/command-center/kpi-card";
import { MetricDefinitionProvider } from "@/components/command-center/metric-definition";
import { ListSkeleton } from "@/components/data/states";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";

import {
  DistributionCard,
  ExternalLink,
  GhToolbar,
  GithubError,
  Heatmap,
  Pager,
  SyncStatusBanner,
  TrendCard,
} from "./common";
import {
  useGithubActivity,
  useGithubCommitDistribution,
  useGithubPersonal,
  type ActivityEvent,
} from "./use-github";

const EVENT_LABEL: Record<string, { label: string; tone: "info" | "success" | "neutral" | "warning" }> = {
  commit: { label: "Commit", tone: "neutral" },
  pull_request_opened: { label: "PR opened", tone: "info" },
  pull_request_merged: { label: "PR merged", tone: "success" },
  pull_request_closed: { label: "PR closed", tone: "neutral" },
  issue_opened: { label: "Issue opened", tone: "info" },
  issue_closed: { label: "Issue closed", tone: "neutral" },
  release: { label: "Release", tone: "warning" },
};

const TYPE_OPTIONS = [
  { value: "all", label: "All event types" },
  { value: "commit", label: "Commits" },
  { value: "pull_request", label: "Pull requests" },
  { value: "issue", label: "Issues" },
  { value: "release", label: "Releases" },
];

function Timeline({ range, repo, type }: { range: string; repo: string; type: string }) {
  const [page, setPage] = useState(1);
  const q = useGithubActivity({ range, repo: repo || undefined, type, page });
  const events = q.data?.events ?? [];
  return (
    <section aria-labelledby="timeline" className="flex flex-col gap-2">
      <h2 id="timeline" className="text-h4 font-semibold">
        Activity timeline
      </h2>
      {q.isPending ? (
        <ListSkeleton rows={6} />
      ) : events.length === 0 ? (
        <p className="rounded-md border bg-surface px-3 py-6 text-center text-muted-foreground">
          No activity in this period for the selected filters.
        </p>
      ) : (
        <ol className="divide-y rounded-lg border bg-surface">
          {events.map((e: ActivityEvent, i) => {
            const meta = EVENT_LABEL[e.type] ?? { label: e.type, tone: "neutral" as const };
            return (
              <li key={`${e.type}-${e.repoExternalId}-${e.timestamp}-${i}`} className="flex flex-col gap-1 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  <ExternalLink url={e.url}>
                    <span className="font-medium">{e.title ?? "(no title)"}</span>
                  </ExternalLink>
                </div>
                <p className="text-caption text-muted-foreground">
                  {e.repoFullName} · {e.actor ?? "unknown"} ·{" "}
                  {e.timestamp ? new Date(e.timestamp).toLocaleString() : "—"}
                </p>
              </li>
            );
          })}
        </ol>
      )}
      {q.data && (
        <Pager
          page={q.data.page.page}
          totalPages={q.data.page.totalPages}
          total={q.data.page.total}
          onPage={setPage}
        />
      )}
    </section>
  );
}

function PersonalPanel({ range }: { range: string }) {
  const q = useGithubPersonal({ range });
  if (q.isPending || q.isError || !q.data) return null;
  const d = q.data;
  if (!d.available) {
    return (
      <p className="rounded-md border bg-surface px-3 py-2 text-caption text-muted-foreground">
        Personal activity is unavailable — the connected GitHub account has no resolvable login.
      </p>
    );
  }
  return (
    <section aria-labelledby="personal" className="flex flex-col gap-2">
      <h2 id="personal" className="text-h4 font-semibold">
        Your GitHub activity{d.login ? ` · ${d.login}` : ""}
      </h2>
      <p className="text-caption text-muted-foreground">
        Activity authored by the connected account, computed from synchronized data in UTC.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {d.commits && <KpiCard metric={d.commits} href={null} detail={d.period.label} />}
        {d.pullRequests && <KpiCard metric={d.pullRequests} href={null} detail={d.period.label} />}
        {d.issues && <KpiCard metric={d.issues} href={null} detail={d.period.label} />}
        {d.repositories && <KpiCard metric={d.repositories} href={null} detail={d.period.label} />}
        {d.activeDays && <KpiCard metric={d.activeDays} href={null} detail={d.period.label} />}
      </div>
    </section>
  );
}

function Body() {
  const [range, setRange] = useState("90d");
  const [repo, setRepo] = useState("");
  const [type, setType] = useState("all");
  const activity = useGithubActivity({ range, repo: repo || undefined, type });
  const dist = useGithubCommitDistribution({ range });

  if (activity.isError)
    return <GithubError error={activity.error} onRetry={() => void activity.refetch()} />;

  return (
    <div className="flex flex-col gap-5">
      <GhToolbar
        range={range}
        onRange={setRange}
        repo={repo}
        onRepo={setRepo}
        extra={
          <NativeSelect
            aria-label="Event type"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        }
      />
      <SyncStatusBanner />

      {activity.isPending ? (
        <ListSkeleton rows={6} />
      ) : (
        <>
          <section aria-labelledby="activity-kpis">
            <h2 id="activity-kpis" className="sr-only">
              Activity indicators
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <KpiCard metric={activity.data.total} href={null} detail={activity.data.period.label} />
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <TrendCard metric={activity.data.trend} title="Activity over time" />
            <DistributionCard metric={activity.data.byRepository} title="Activity by repository" />
          </div>

          {dist.data && (
            <>
              <Heatmap metric={dist.data.heatmap} max={dist.data.heatmapMax} />
              <div className="grid gap-4 xl:grid-cols-2">
                <DistributionCard
                  metric={dist.data.byDayOfWeek}
                  title="Commits by day of week (UTC)"
                  horizontal
                />
                <DistributionCard
                  metric={dist.data.byHour}
                  title="Commits by hour (UTC)"
                  horizontal={false}
                />
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <DistributionCard metric={dist.data.byAuthor} title="Commits by author" />
                <div className="rounded-lg border bg-surface p-3">
                  <p className="text-caption text-muted-foreground">
                    Longest gap between active commit days
                  </p>
                  <p className="text-h2 font-semibold tabular">
                    {dist.data.longestGap.value === null
                      ? "—"
                      : `${dist.data.longestGap.value} day${dist.data.longestGap.value === 1 ? "" : "s"}`}
                  </p>
                  <p className="text-caption text-muted-foreground">
                    {dist.data.longestGap.stateReason ?? dist.data.period.label}
                  </p>
                </div>
              </div>
            </>
          )}

          <PersonalPanel range={range} />
          <Timeline range={range} repo={repo} type={type} />
        </>
      )}
    </div>
  );
}

export function GitHubActivity() {
  return (
    <MetricDefinitionProvider>
      <Body />
    </MetricDefinitionProvider>
  );
}
