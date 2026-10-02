"use client";

import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { useShowDefinition } from "@/components/command-center/metric-definition";
import { formatDate } from "@/components/data/detail";
import { ErrorState, ListSkeleton } from "@/components/data/states";
import {
  EVIDENCE_TYPE_OPTIONS,
  labelOf,
  PROJECT_HEALTH_OPTIONS,
  PROJECT_STATUS_OPTIONS,
} from "@/components/records/options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApiGet, type Paginated } from "@/lib/api/hooks";
import { cn } from "@/lib/ui/cn";
import type { ActivityItem } from "@/modules/analytics/activity.service";
import type { MetricResult } from "@/modules/analytics/metric-result";
import type { ComputedHealth, HealthComponent } from "@/modules/projects/project-health";
import type { ProjectIntelligenceDto } from "@/modules/projects/project-intelligence";

import { MilestoneManager } from "./milestones";

const n = (v: number) => new Intl.NumberFormat().format(v);
export const percent = (v: number) => `${Math.round(v * 100)}%`;

export const MANUAL_TONE = {
  on_track: "success",
  at_risk: "warning",
  blocked: "danger",
  not_assessed: "neutral",
} as const;
export const BAND_TONE = { good: "success", watch: "warning", poor: "danger" } as const;
const BAND_LABEL = { good: "Good", watch: "Needs watching", poor: "Poor" } as const;
const COMPONENT_STATE = {
  scored: { label: "Scored", tone: "info" },
  insufficient_data: { label: "Insufficient data", tone: "warning" },
  not_applicable: { label: "Not applicable", tone: "neutral" },
  unavailable: { label: "Unavailable", tone: "neutral" },
} as const;
const OVERALL_STATUS = {
  complete: "All components scored",
  partial: "Partial",
  insufficient_data: "Insufficient data",
  not_applicable: "Not assessed",
} as const;

export function useProjectIntelligence(projectId: string) {
  return useApiGet<{ data: ProjectIntelligenceDto }>(
    ["projects", "intelligence", projectId],
    `/api/v1/projects/${projectId}/intelligence`,
  );
}

function DossierSection({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id={`${id}-title`} className="text-h2 font-semibold">
            {title}
          </h2>
          {description && <p className="text-caption text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

export const DOSSIER_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "health", label: "Health" },
  { id: "delivery", label: "Delivery" },
  { id: "context", label: "Engineering context" },
  { id: "evidence", label: "Evidence" },
  { id: "activity", label: "Activity" },
] as const;

export function DossierNav() {
  return (
    <nav aria-label="Dossier sections" className="mb-4 overflow-x-auto">
      <ul className="flex gap-1 border-b pb-1 text-body">
        {DOSSIER_SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="inline-block rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Fact({ label, value, href }: { label: string; value: ReactNode; href?: string | null }) {
  return (
    <div className="min-w-0 rounded-md border bg-surface-sunken/40 p-2.5">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-h3 font-semibold tabular">
        {href ? (
          <Link href={href as never} className="hover:underline">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

const metricValue = (m: MetricResult) => (m.value === null ? "—" : n(m.value));

// ── Lifecycle & schedule ────────────────────────────────────────────────────

export function LifecyclePanel({ intel }: { intel: ProjectIntelligenceDto }) {
  const { lifecycle, schedule } = intel;
  const scheduleText =
    schedule.completedAt && schedule.targetDate
      ? schedule.daysLateAtCompletion
        ? `Completed ${schedule.daysLateAtCompletion} days after the target date.`
        : "Completed on or before the target date."
      : schedule.completedAt
        ? "Completed (no target date recorded)."
        : schedule.daysToTarget === null
          ? "No target date recorded."
          : schedule.daysToTarget < 0
            ? `Target date passed ${-schedule.daysToTarget} days ago.`
            : schedule.daysToTarget === 0
              ? "Target date is today."
              : `Target date in ${schedule.daysToTarget} days.`;
  return (
    <div className="rounded-lg border bg-surface p-4">
      <h3 className="text-h3 font-semibold">Lifecycle</h3>
      <p className="text-caption text-muted-foreground">
        Stage {lifecycle.position} of {lifecycle.stages.length}. PEOS records the current stage only
        — it does not record when stages changed, so no transition history is shown.
      </p>
      <ol className="mt-3 flex flex-wrap gap-1" aria-label="Project lifecycle">
        {lifecycle.stages.map((stage) => {
          const current = stage === lifecycle.status;
          return (
            <li key={stage}>
              <Link
                href={`/projects?status=${stage}` as never}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "inline-block rounded-md border px-2 py-1 text-caption",
                  current
                    ? "border-brand bg-brand font-semibold text-brand-foreground"
                    : "text-muted-foreground hover:bg-accent",
                )}
                aria-label={`${labelOf(PROJECT_STATUS_OPTIONS, stage)}${current ? " (current stage)" : ""}: view projects in this stage`}
              >
                {labelOf(PROJECT_STATUS_OPTIONS, stage)}
              </Link>
            </li>
          );
        })}
      </ol>
      <h3 className="mt-4 text-h3 font-semibold">Schedule</h3>
      <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fact label="Start" value={formatDate(schedule.startDate) ?? "—"} />
        <Fact label="Target" value={formatDate(schedule.targetDate) ?? "—"} />
        <Fact label="Completed" value={formatDate(schedule.completedAt) ?? "—"} />
        <Fact label="Evaluated on (UTC)" value={formatDate(intel.evaluatedOn) ?? "—"} />
      </dl>
      <p className="mt-2 text-body">{scheduleText}</p>
    </div>
  );
}

// ── Health ──────────────────────────────────────────────────────────────────

function ComponentRow({ c }: { c: HealthComponent }) {
  const state = COMPONENT_STATE[c.state];
  return (
    <tr className="align-top">
      <th scope="row" className="py-2 pr-3 text-left font-medium">
        {c.label}
      </th>
      <td className="py-2 pr-3">
        <Badge tone={state.tone}>{state.label}</Badge>
      </td>
      <td className="py-2 pr-3 text-right tabular">{c.score ?? "—"}</td>
      <td className="py-2 pr-3">{c.explanation}</td>
      <td className="py-2 text-caption text-muted-foreground">
        {c.inputs.length ? c.inputs.join(", ") : "No data source"}
      </td>
    </tr>
  );
}

export function HealthPanel({ manual, computed }: { manual: string; computed: ComputedHealth }) {
  const showDefinition = useShowDefinition();
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-surface p-4">
          <h3 className="text-h3 font-semibold">Manual health</h3>
          <p className="mt-2">
            <Badge tone={MANUAL_TONE[manual as keyof typeof MANUAL_TONE]}>
              {labelOf(PROJECT_HEALTH_OPTIONS, manual)}
            </Badge>
          </p>
          <p className="mt-2 text-caption text-muted-foreground">
            Your own assessment, set with Edit. PEOS never changes it — the computed signal is a
            separate view of the recorded data.
          </p>
        </div>
        <div className="rounded-lg border bg-surface p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-h3 font-semibold">Computed health signal</h3>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="How computed health is calculated"
              onClick={() => showDefinition("projects.health_score")}
            >
              <Info aria-hidden />
            </Button>
          </div>
          {computed.score !== null && computed.band ? (
            <p className="mt-1 flex flex-wrap items-baseline gap-2">
              <span
                className="text-metric font-semibold tabular"
                aria-label={`Score ${computed.score} out of 100`}
              >
                {computed.score}
                <span className="text-body text-muted-foreground"> / 100</span>
              </span>
              <Badge tone={BAND_TONE[computed.band]}>{BAND_LABEL[computed.band]}</Badge>
              <Badge>{OVERALL_STATUS[computed.status]}</Badge>
            </p>
          ) : (
            <p className="mt-1 flex flex-wrap items-baseline gap-2">
              <span
                className="text-metric font-semibold text-muted-foreground"
                aria-label="No overall score"
              >
                —
              </span>
              <Badge>{OVERALL_STATUS[computed.status]}</Badge>
            </p>
          )}
          <p className="mt-2 text-body">{computed.explanation}</p>
          <p className="mt-1 text-caption text-muted-foreground">
            Model {computed.model} · evaluated {formatDate(computed.evaluatedOn)} (UTC) · not
            stored, so no history.
          </p>
        </div>
      </div>
      {computed.components.length > 0 && (
        <div
          className="overflow-x-auto rounded-lg border bg-surface p-4"
          role="region"
          aria-label="Health components (scrolls horizontally on small screens)"
          tabIndex={0}
        >
          <table className="w-full min-w-[40rem] text-body">
            <caption className="mb-2 text-left text-h3 font-semibold">
              Health components
              <span className="block text-caption font-normal text-muted-foreground">
                Each scored component counts equally. Components without data are listed, never
                guessed.
              </span>
            </caption>
            <thead className="text-caption text-muted-foreground">
              <tr>
                <th scope="col" className="py-1 pr-3 text-left font-medium">
                  Component
                </th>
                <th scope="col" className="py-1 pr-3 text-left font-medium">
                  Result
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  Score
                </th>
                <th scope="col" className="py-1 pr-3 text-left font-medium">
                  Explanation
                </th>
                <th scope="col" className="py-1 text-left font-medium">
                  Source
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {computed.components.map((c) => (
                <ComponentRow key={c.key} c={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Delivery ────────────────────────────────────────────────────────────────

export function DeliveryPanel({
  projectId,
  intel,
}: {
  projectId: string;
  intel: ProjectIntelligenceDto;
}) {
  const m = intel.milestones;
  const rate = m.deliveryRate;
  const base = `/projects/milestones?projectId=${projectId}`;
  return (
    <>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Fact label="Milestones" value={metricValue(m.total)} href={m.total.value ? base : null} />
        <Fact
          label="Completed"
          value={metricValue(m.completed)}
          href={m.completed.value ? `${base}&status=completed` : null}
        />
        <Fact
          label="Overdue"
          value={metricValue(m.overdue)}
          href={m.overdue.value ? `${base}&overdue=true` : null}
        />
        <Fact
          label="Blocked"
          value={metricValue(m.blocked)}
          href={m.blocked.value ? `${base}&status=blocked` : null}
        />
        <div className="min-w-0 rounded-md border bg-surface-sunken/40 p-2.5">
          <dt className="text-caption text-muted-foreground">Delivery rate</dt>
          <dd className="text-h3 font-semibold tabular">
            {rate.value === null ? "—" : percent(rate.value)}
          </dd>
          <dd className="text-caption text-muted-foreground">
            {rate.value === null
              ? rate.stateReason
              : `${rate.breakdown![0]!.value} completed of ${rate.breakdown![0]!.value + rate.breakdown![1]!.value} done or past due`}
          </dd>
        </div>
      </dl>
      <MilestoneManager projectId={projectId} />
    </>
  );
}

// ── Evidence ────────────────────────────────────────────────────────────────

export function EvidencePanel({
  projectId,
  intel,
}: {
  projectId: string;
  intel: ProjectIntelligenceDto;
}) {
  const e = intel.evidence;
  const base = `/evidence?projectId=${projectId}`;
  if (e.total.value === null) {
    return (
      <p className="rounded-lg border bg-surface p-4 text-muted-foreground">
        {e.total.stateReason} Link evidence below to document what this project delivered.
      </p>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border bg-surface p-4">
        <h3 className="text-h3 font-semibold">Evidence summary</h3>
        <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Fact label="Linked" value={metricValue(e.total)} href={base} />
          <Fact label="Verified" value={metricValue(e.verified)} href={`${base}&verified=true`} />
          <Fact
            label="Unverified"
            value={n((e.total.value ?? 0) - (e.verified.value ?? 0))}
            href={`${base}&verified=false`}
          />
          <Fact label="Dated" value={n(e.dated)} href={`${base}&dated=true`} />
          <Fact label="Undated" value={n(e.undated)} href={`${base}&dated=false`} />
          <Fact label="Imported" value={n(e.byOrigin.import)} href={`${base}&origin=import`} />
        </dl>
        <h4 className="mt-4 text-body font-semibold">By type</h4>
        <table className="mt-1 w-full text-body">
          <caption className="sr-only">Project evidence by type</caption>
          <thead className="text-caption text-muted-foreground">
            <tr>
              <th scope="col" className="py-1 text-left font-medium">
                Type
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Items
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {e.byType.breakdown!.map((b) => (
              <tr key={b.key}>
                <th scope="row" className="py-1 text-left font-normal">
                  <Link
                    href={`${base}&type=${b.key}` as never}
                    className="underline underline-offset-4"
                  >
                    {labelOf(EVIDENCE_TYPE_OPTIONS, b.key)}
                  </Link>
                </th>
                <td className="py-1 text-right tabular">{n(b.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {e.relatedSkills.length > 0 && (
          <>
            <h4 className="mt-4 text-body font-semibold">Skills supported by this evidence</h4>
            <ul className="mt-1 flex flex-wrap gap-1">
              {e.relatedSkills.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/skills/${s.id}` as never}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-caption hover:bg-accent"
                  >
                    {s.name}
                    <span className="text-muted-foreground tabular">{s.evidenceCount}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div className="rounded-lg border bg-surface p-4">
        <h3 className="text-h3 font-semibold">Evidence timeline</h3>
        <p className="text-caption text-muted-foreground">
          Latest dated evidence, by the evidence date you recorded.
          {e.undated > 0 &&
            ` ${e.undated} undated item${e.undated === 1 ? " is" : "s are"} not shown.`}
        </p>
        {e.timeline.length === 0 ? (
          <p className="mt-2 text-muted-foreground">No linked evidence has a date.</p>
        ) : (
          <ol className="mt-2 divide-y" aria-label="Project evidence, newest first">
            {e.timeline.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                <time
                  dateTime={item.date}
                  className="w-24 text-caption text-muted-foreground tabular"
                >
                  {formatDate(item.date)}
                </time>
                <Link
                  href={`/evidence/${item.id}` as never}
                  className="min-w-0 basis-full font-medium hover:underline sm:flex-1 sm:basis-auto"
                >
                  {item.title}
                </Link>
                <Badge>{labelOf(EVIDENCE_TYPE_OPTIONS, item.type)}</Badge>
                {item.verified ? <Badge tone="success">Verified</Badge> : <Badge>Unverified</Badge>}
              </li>
            ))}
          </ol>
        )}
        <p className="mt-2">
          <Link
            href={`${base}&sort=-date` as never}
            className="text-body underline underline-offset-4"
          >
            View all project evidence
          </Link>
        </p>
      </div>
    </div>
  );
}

// ── Activity ────────────────────────────────────────────────────────────────

export function ProjectActivity({ projectId }: { projectId: string }) {
  const [page, setPage] = useState(1);
  const query = useApiGet<Paginated<ActivityItem>>(
    ["projects", "activity", projectId, page],
    `/api/v1/projects/${projectId}/activity?page=${page}&pageSize=15`,
  );
  if (query.isPending) return <ListSkeleton rows={3} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const { data, page: info } = query.data;
  return (
    <div className="rounded-lg border bg-surface">
      {data.length === 0 ? (
        <p className="p-4 text-muted-foreground">No recorded activity.</p>
      ) : (
        <ol className="divide-y" aria-label="Project activity, newest first">
          {data.map((item) => (
            <li key={item.id} className="flex flex-wrap gap-x-3 gap-y-0.5 px-4 py-2">
              <time dateTime={item.at} className="w-44 text-caption text-muted-foreground tabular">
                {new Date(item.at).toLocaleString()}
              </time>
              <span className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
                {item.summary}{" "}
                {item.label &&
                  (item.href ? (
                    <Link
                      href={item.href as never}
                      className="font-medium underline underline-offset-4"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span className="font-medium">{item.label}</span>
                  ))}
                {item.deleted && <span className="text-muted-foreground"> (deleted)</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      {info.totalPages > 1 && (
        <nav
          aria-label="Activity pages"
          className="flex items-center justify-end gap-1 border-t px-4 py-2"
        >
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft aria-hidden />
            Newer
          </Button>
          <span className="text-caption tabular">
            {page} / {info.totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= info.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Older
            <ChevronRight aria-hidden />
          </Button>
        </nav>
      )}
    </div>
  );
}

export { DossierSection };
