"use client";

import { Info, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";

import {
  MetricDefinitionProvider,
  useShowDefinition,
} from "@/components/command-center/metric-definition";
import { ConfirmDelete } from "@/components/data/confirm-delete";
import {
  BackLink,
  DetailHeader,
  DetailSkeleton,
  FieldGrid,
  formatDate,
  Panel,
} from "@/components/data/detail";
import { RelationPicker } from "@/components/data/relation-picker";
import { ErrorState } from "@/components/data/states";
import { EntityFormDialog } from "@/components/forms/entity-form";
import { labelOf } from "@/components/records/options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useApiGet, useApiMutation } from "@/lib/api/hooks";
import { ApiError, errorMessage } from "@/lib/http/fetch-json";
import { useReturnFocus } from "@/lib/ui/return-focus";
import type {
  ExperimentComparisonDto,
  ExperimentDossierDto,
} from "@/modules/experiments/experiment-intelligence";
import { EXPERIMENT_TRANSITIONS } from "@/modules/experiments/experiment.rules";

import { DecisionBadge, ReproBadge, StatusBadge } from "./experiments-list";
import {
  DECISION_OPTIONS,
  EXPERIMENT_EDIT_FIELDS,
  METRIC_FIELDS,
  metricPayload,
  RUN_FIELDS,
  RUN_STATUS_TONE,
  TRANSITION_LABEL,
} from "./options";

const INVALIDATES = ["experiments", "analytics", "projects", "evidence", "search"];
const n = (v: number | null) =>
  v === null ? "—" : new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(v);

type Run = ExperimentDossierDto["runs"][number];

export function useExperimentDossier(id: string) {
  return useApiGet<{ data: ExperimentDossierDto }>(
    ["experiments", "dossier", id],
    `/api/v1/experiments/${id}/intelligence`,
  );
}

function Section({
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
    <section
      id={id}
      aria-labelledby={`${id}-t`}
      className="scroll-mt-20 rounded-lg border bg-surface"
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 id={`${id}-t`} className="text-h3 font-semibold">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-caption text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="flex flex-wrap gap-2">{action}</div>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

// ── Lifecycle ─────────────────────────────────────────────────────────────

function CompleteDialog({
  open,
  onOpenChange,
  today,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  today: string;
  onConfirm: (completedAt: string) => Promise<unknown>;
}) {
  const returnFocus = useReturnFocus();
  const fieldId = useId();
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" {...returnFocus}>
        <DialogHeader>
          <DialogTitle>Mark experiment completed</DialogTitle>
          <DialogDescription>
            Completion records that you finished the experiment. It is separate from the decision
            (adopt/reject) and from any measured result. The date cannot be in the future.
          </DialogDescription>
        </DialogHeader>
        <label htmlFor={fieldId} className="text-caption text-muted-foreground">
          Completion date
        </label>
        <Input
          id={fieldId}
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={saving || !date}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                await onConfirm(date);
                onOpenChange(false);
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Mark completed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LifecycleActions({
  status,
  today,
  onTransition,
}: {
  status: ExperimentDossierDto["experiment"]["status"];
  today: string;
  onTransition: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const run = async (to: string) => {
    setPending(true);
    setError(null);
    try {
      await onTransition({ status: to });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Lifecycle actions">
        {EXPERIMENT_TRANSITIONS[status].map((to) => (
          <Button
            key={to}
            variant={to === "abandoned" ? "outline" : "secondary"}
            size="sm"
            disabled={pending}
            onClick={() => (to === "completed" ? setCompleting(true) : void run(to))}
          >
            {status === "completed" && to === "active" ? "Reopen" : TRANSITION_LABEL[to]}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
      <CompleteDialog
        open={completing}
        onOpenChange={setCompleting}
        today={today}
        onConfirm={(completedAt) => onTransition({ status: "completed", completedAt })}
      />
    </div>
  );
}

// ── Runs & metrics ──────────────────────────────────────────────────────────

function RunCard({ experimentId, run }: { experimentId: string; run: Run }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingMetric, setAddingMetric] = useState(false);
  const [deletingMetric, setDeletingMetric] = useState<{ id: string; name: string } | null>(null);
  const base = `/api/v1/experiments/${experimentId}/runs/${run.id}`;
  const updateRun = useApiMutation<Record<string, unknown>>("PATCH", base, INVALIDATES);
  const deleteRun = useApiMutation<void>("DELETE", base, INVALIDATES);
  const addMetric = useApiMutation<Record<string, unknown>>("POST", `${base}/metrics`, INVALIDATES);
  const deleteMetric = useApiMutation<{ id: string }>(
    "DELETE",
    (b) => `${base}/metrics/${b.id}`,
    INVALIDATES,
  );
  const repro = run.reproducibility;
  const config: [string, string | null][] = [
    ["Model", run.model],
    ["Model version", run.modelVersion],
    ["Provider", run.provider],
    ["Prompt version", run.promptVersion],
    ["Dataset", run.datasetName],
    ["Dataset version", run.datasetVersion],
    ["Code ref", run.codeRef],
    ["Environment", run.environment],
  ];
  return (
    <li className="rounded-md border bg-surface-sunken/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">
          Run #{run.runNumber}
          {run.label ? ` — ${run.label}` : ""}
        </h4>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={RUN_STATUS_TONE[run.status]}>{run.status}</Badge>
          <ReproBadge state={repro.state} />
          {run.runAt && (
            <span className="text-caption text-muted-foreground tabular">
              {formatDate(run.runAt)}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit run ${run.runNumber}`}
            onClick={() => setEditing(true)}
          >
            <Pencil aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete run ${run.runNumber}`}
            onClick={() => setDeleting(true)}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-caption sm:grid-cols-4">
        {config
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
        <div>
          <dt className="text-muted-foreground">Cost</dt>
          <dd>{run.costUsd === null ? "not recorded" : `$${n(run.costUsd)}`}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Latency</dt>
          <dd>{run.latencyMs === null ? "not recorded" : `${n(run.latencyMs)} ms`}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Tokens</dt>
          <dd>
            {run.tokensInput === null && run.tokensOutput === null
              ? "not recorded"
              : `${run.tokensInput ?? "?"} in / ${run.tokensOutput ?? "?"} out`}
          </dd>
        </div>
      </dl>
      {repro.missing.length > 0 && (
        <p className="mt-1 text-caption text-muted-foreground">
          Reproducibility: missing {repro.missing.join(", ")} (recorded metadata only).
        </p>
      )}

      <div className="mt-3">
        <div className="flex items-center justify-between">
          <h5 className="text-body font-medium">Evaluation ({run.metrics.length})</h5>
          <Button variant="outline" size="xs" onClick={() => setAddingMetric(true)}>
            <Plus aria-hidden />
            Add metric
          </Button>
        </div>
        {run.metrics.length === 0 ? (
          <p className="text-caption text-muted-foreground">Not evaluated.</p>
        ) : (
          <table className="mt-1 w-full text-caption">
            <caption className="sr-only">
              Recorded evaluation metrics for run {run.runNumber}
            </caption>
            <thead className="text-muted-foreground">
              <tr>
                <th scope="col" className="py-0.5 text-left font-medium">
                  Criterion
                </th>
                <th scope="col" className="py-0.5 text-right font-medium">
                  Value
                </th>
                <th scope="col" className="py-0.5 text-left font-medium">
                  Direction
                </th>
                <th scope="col" className="w-8 py-0.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {run.metrics.map((mt) => (
                <tr key={mt.id}>
                  <th scope="row" className="py-1 text-left font-normal">
                    {mt.name}
                    {mt.note ? <span className="text-muted-foreground"> · {mt.note}</span> : null}
                  </th>
                  <td className="py-1 text-right tabular">
                    {n(mt.value)}
                    {mt.unit ? ` ${mt.unit}` : ""}
                  </td>
                  <td className="py-1">
                    {mt.higherIsBetter === null
                      ? "—"
                      : mt.higherIsBetter
                        ? "higher better"
                        : "lower better"}
                  </td>
                  <td className="py-0.5 text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete metric ${mt.name}`}
                      onClick={() => setDeletingMetric({ id: mt.id, name: mt.name })}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {run.notes && <p className="mt-2 text-caption whitespace-pre-line">{run.notes}</p>}

      <EntityFormDialog
        open={editing}
        onOpenChange={setEditing}
        title={`Edit run #${run.runNumber}`}
        fields={RUN_FIELDS}
        initial={run as unknown as Record<string, unknown>}
        submitLabel="Save changes"
        onSubmit={(payload) => updateRun.mutateAsync(payload)}
      />
      <ConfirmDelete
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete run #${run.runNumber}?`}
        description="The run and its evaluation metrics are permanently deleted. The deletion is recorded in the audit log."
        onConfirm={() => deleteRun.mutateAsync()}
      />
      <EntityFormDialog
        open={addingMetric}
        onOpenChange={setAddingMetric}
        title={`Add metric to run #${run.runNumber}`}
        description="Record a real measured value with its unit. No composite score is computed."
        fields={METRIC_FIELDS}
        submitLabel="Add metric"
        onSubmit={(payload) => addMetric.mutateAsync(metricPayload(payload))}
      />
      <ConfirmDelete
        open={deletingMetric !== null}
        onOpenChange={(o) => !o && setDeletingMetric(null)}
        title="Delete metric?"
        description={`“${deletingMetric?.name ?? ""}” will be permanently deleted.`}
        onConfirm={() => deleteMetric.mutateAsync({ id: deletingMetric!.id })}
      />
    </li>
  );
}

// ── Comparison ────────────────────────────────────────────────────────────

const VERDICT_TONE: Record<string, "success" | "danger" | "neutral"> = {
  improvement: "success",
  regression: "danger",
  equal: "neutral",
  incomparable: "neutral",
  no_direction: "neutral",
};

function Comparison({ experimentId, runs }: { experimentId: string; runs: Run[] }) {
  const aId = useId();
  const bId = useId();
  const [a, setA] = useState(runs[0]?.id ?? "");
  const [b, setB] = useState(runs[1]?.id ?? "");
  const enabled = Boolean(a && b && a !== b);
  const query = useApiGet<{ data: ExperimentComparisonDto }>(
    ["experiments", "compare", experimentId, a, b],
    `/api/v1/experiments/${experimentId}/compare?a=${a}&b=${b}`,
    enabled,
  );
  const fmt = (v: number | null, unit?: string | null) =>
    v === null ? "—" : `${n(v)}${unit ? ` ${unit}` : ""}`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-caption text-muted-foreground">
          Baseline (A)
          <NativeSelect id={aId} value={a} onChange={(e) => setA(e.target.value)}>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.runNumber} {r.label ?? ""}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-caption text-muted-foreground">
          Candidate (B)
          <NativeSelect id={bId} value={b} onChange={(e) => setB(e.target.value)}>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.runNumber} {r.label ?? ""}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>
      {!enabled ? (
        <p className="text-muted-foreground">Choose two different runs to compare.</p>
      ) : query.isPending ? (
        <p className="text-muted-foreground">Comparing…</p>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <div
          className="relative overflow-x-auto"
          role="region"
          aria-label="Run comparison (scrolls horizontally on small screens)"
          tabIndex={0}
        >
          <table className="w-full min-w-[34rem] text-body">
            <caption className="sr-only">
              Differences between run A and run B. No overall winner is declared.
            </caption>
            <thead className="text-caption text-muted-foreground">
              <tr>
                <th scope="col" className="py-1 pr-3 text-left font-medium">
                  Field
                </th>
                <th scope="col" className="py-1 pr-3 text-left font-medium">
                  A
                </th>
                <th scope="col" className="py-1 pr-3 text-left font-medium">
                  B
                </th>
                <th scope="col" className="py-1 text-left font-medium">
                  Change
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {query.data.data.diff.config
                .filter((c) => c.a || c.b)
                .map((c) => (
                  <tr key={c.key}>
                    <th scope="row" className="py-1 pr-3 text-left font-normal">
                      {c.key}
                    </th>
                    <td className="py-1 pr-3">{c.a ?? "—"}</td>
                    <td className="py-1 pr-3">{c.b ?? "—"}</td>
                    <td className="py-1">
                      {c.changed ? <Badge tone="info">changed</Badge> : "same"}
                    </td>
                  </tr>
                ))}
              {query.data.data.diff.measures.map((mz) => (
                <tr key={mz.key}>
                  <th scope="row" className="py-1 pr-3 text-left font-normal">
                    {mz.key} ({mz.unit})
                  </th>
                  <td className="py-1 pr-3 tabular">{fmt(mz.a)}</td>
                  <td className="py-1 pr-3 tabular">{fmt(mz.b)}</td>
                  <td className="py-1">
                    {mz.verdict === "incomparable" ? (
                      <span className="text-muted-foreground">not measured</span>
                    ) : (
                      <Badge tone={VERDICT_TONE[mz.verdict]}>
                        {mz.delta === 0 ? "equal" : `${mz.delta! > 0 ? "+" : ""}${n(mz.delta)}`}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
              {query.data.data.diff.metrics.map((mt) => (
                <tr key={mt.name}>
                  <th scope="row" className="py-1 pr-3 text-left font-normal">
                    {mt.name}
                    {mt.unit ? ` (${mt.unit})` : ""}
                  </th>
                  <td className="py-1 pr-3 tabular">{fmt(mt.a)}</td>
                  <td className="py-1 pr-3 tabular">{fmt(mt.b)}</td>
                  <td className="py-1">
                    {mt.verdict === "incomparable" ? (
                      <span className="text-muted-foreground">not measured in both</span>
                    ) : mt.verdict === "no_direction" ? (
                      <span className="text-muted-foreground tabular">
                        {mt.delta === 0 ? "equal" : `${mt.delta! > 0 ? "+" : ""}${n(mt.delta)}`} (no
                        direction)
                      </span>
                    ) : (
                      <Badge tone={VERDICT_TONE[mt.verdict]}>
                        {mt.delta === 0 ? "equal" : `${mt.delta! > 0 ? "+" : ""}${n(mt.delta)}`}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-caption text-muted-foreground">
            Direction comes from each metric&apos;s “higher/lower is better”. No single winner is
            declared; a value missing on either side is “not measured”.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Dossier ─────────────────────────────────────────────────────────────────

function Body({ d }: { d: ExperimentDossierDto }) {
  const router = useRouter();
  const e = d.experiment;
  const path = `/api/v1/experiments/${e.id}`;
  const showDefinition = useShowDefinition();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingRun, setAddingRun] = useState(false);
  const [pickingEvidence, setPickingEvidence] = useState(false);
  const update = useApiMutation<Record<string, unknown>>("PATCH", path, INVALIDATES);
  const remove = useApiMutation<void>("DELETE", path, INVALIDATES);
  const createRun = useApiMutation<Record<string, unknown>>("POST", `${path}/runs`, INVALIDATES);
  const setEvidence = useApiMutation<{ evidenceIds: string[] }>(
    "PUT",
    `${path}/evidence`,
    INVALIDATES,
  );

  return (
    <>
      <DetailHeader
        title={e.title}
        subtitle={e.category ?? "AI experiment"}
        badges={
          <>
            <StatusBadge status={e.status} />
            <DecisionBadge decision={e.decision} />
            <ReproBadge state={d.reproducibility.state} />
            {e.completedAt && <Badge tone="success">Completed {formatDate(e.completedAt)}</Badge>}
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              Edit
            </Button>
            <Button variant="outline" onClick={() => setDeleting(true)}>
              <Trash2 aria-hidden />
              Delete
            </Button>
          </>
        }
      />
      <div className="mb-4">
        <LifecycleActions
          status={e.status}
          today={d.evaluatedOn}
          onTransition={(body) => update.mutateAsync(body)}
        />
      </div>

      <div className="flex flex-col gap-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Panel title="Experiment">
              <FieldGrid
                items={[
                  { label: "Objective", value: e.objective, wide: true },
                  { label: "Hypothesis", value: e.hypothesis, wide: true },
                  {
                    label: "Decision (your conclusion)",
                    value: e.decision ? labelOf(DECISION_OPTIONS, e.decision) : null,
                  },
                  { label: "Result", value: e.result, wide: true },
                  { label: "Reproducibility notes", value: e.reproducibilityNote, wide: true },
                  {
                    label: "Project",
                    value: d.project ? (
                      <Link
                        href={`/projects/${d.project.id}`}
                        className="underline underline-offset-4"
                      >
                        {d.project.name}
                      </Link>
                    ) : null,
                  },
                  { label: "Started", value: formatDate(e.startedAt) },
                ]}
              />
              <p className="mt-3 text-caption text-muted-foreground">
                Entered by you. PEOS records experiments; it does not run models, so measurements
                below are values you recorded (evaluated {formatDate(d.evaluatedOn)}, UTC).
              </p>
            </Panel>
          </div>
          <Panel
            title="Reproducibility"
            action={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="How reproducibility is assessed"
                onClick={() => showDefinition("ai.reproducibility_distribution")}
              >
                <Info aria-hidden />
              </Button>
            }
          >
            <p className="flex flex-wrap items-center gap-2">
              <ReproBadge state={d.reproducibility.state} />
            </p>
            <p className="mt-2 text-caption text-muted-foreground">
              {d.reproducibility.explanation}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-1 text-caption">
              <dt className="text-muted-foreground">Runs</dt>
              <dd className="tabular">{d.signals.runs.total}</dd>
              <dt className="text-muted-foreground">Evaluated runs</dt>
              <dd className="tabular">{d.signals.evaluation.runsWithMetrics}</dd>
              <dt className="text-muted-foreground">Evidence</dt>
              <dd className="tabular">{d.signals.evidence}</dd>
            </dl>
          </Panel>
        </div>

        <Section
          id="runs"
          title={`Runs (${d.runs.length})`}
          description="Each run is one iteration, kept as history and never overwritten. Add a run for every configuration you try."
          action={
            <Button size="sm" onClick={() => setAddingRun(true)}>
              <Plus aria-hidden />
              Add run
            </Button>
          }
        >
          {d.runs.length === 0 ? (
            <p className="text-muted-foreground">
              No runs recorded. Add a run with its model, configuration and measured results.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {d.runs.map((r) => (
                <RunCard key={r.id} experimentId={e.id} run={r} />
              ))}
            </ul>
          )}
        </Section>

        {d.runs.length >= 2 && (
          <Section
            id="compare"
            title="Compare runs"
            description="Differences between two runs — config changes and metric/cost/latency deltas. No overall winner (ADR 0038)."
          >
            <Comparison experimentId={e.id} runs={d.runs} />
          </Section>
        )}

        <Section
          id="evidence"
          title={`Evidence (${d.evidence.length})`}
          description="Supporting evidence, reusing the Evidence domain. Missing evidence is shown, never inferred."
          action={
            <Button variant="outline" size="sm" onClick={() => setPickingEvidence(true)}>
              Manage evidence
            </Button>
          }
        >
          {d.evidence.length === 0 ? (
            <p className="text-muted-foreground">No evidence linked.</p>
          ) : (
            <ul className="divide-y">
              {d.evidence.map((ev) => (
                <li key={ev.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                  <Link
                    href={`/evidence/${ev.id}`}
                    className="min-w-0 basis-full font-medium hover:underline sm:flex-1 sm:basis-auto"
                  >
                    {ev.title}
                  </Link>
                  <Badge>{ev.type.replace(/_/g, " ")}</Badge>
                  {ev.verified ? <Badge tone="success">Verified</Badge> : <Badge>Unverified</Badge>}
                  <span className="text-caption text-muted-foreground tabular">
                    {ev.date ? formatDate(ev.date) : "Undated"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <EntityFormDialog
        open={editing}
        onOpenChange={setEditing}
        title="Edit experiment"
        description="Status and completion use the lifecycle actions. Fields marked * are required."
        fields={EXPERIMENT_EDIT_FIELDS}
        initial={e}
        submitLabel="Save changes"
        onSubmit={(payload) => update.mutateAsync(payload)}
      />
      <EntityFormDialog
        open={addingRun}
        onOpenChange={setAddingRun}
        title="Add run"
        description="Record one iteration. Measured values (cost, latency, tokens) are optional; leave them empty if not measured — they are never assumed to be zero."
        fields={RUN_FIELDS}
        submitLabel="Add run"
        onSubmit={(payload) => createRun.mutateAsync(payload)}
      />
      <ConfirmDelete
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete experiment?"
        description="The experiment, its runs, evaluation metrics and evidence links are permanently deleted. The deletion is recorded in the audit log."
        onConfirm={async () => {
          await remove.mutateAsync();
          router.replace("/ai-lab");
        }}
      />
      <RelationPicker
        open={pickingEvidence}
        onOpenChange={(o) => !o && setPickingEvidence(false)}
        title="Experiment evidence"
        description="Select the evidence that supports this experiment."
        resource="evidence"
        path="/api/v1/evidence"
        optionLabel={(r) => String(r.title)}
        initial={d.evidence.map((ev) => ({ id: ev.id, label: ev.title }))}
        onSave={(items) => setEvidence.mutateAsync({ evidenceIds: items.map((i) => i.id) })}
      />
    </>
  );
}

export function ExperimentDossier({ id }: { id: string }) {
  const query = useExperimentDossier(id);
  return (
    <MetricDefinitionProvider>
      <div>
        <BackLink href="/ai-lab" label="All experiments" />
        {query.isPending ? (
          <DetailSkeleton />
        ) : query.isError ? (
          query.error instanceof ApiError && query.error.status === 404 ? (
            <div role="alert" className="rounded-lg border bg-surface p-6">
              <h1 className="text-h2 font-semibold">Experiment not found</h1>
              <p className="mt-1 text-muted-foreground">
                This experiment does not exist or was deleted.
              </p>
            </div>
          ) : (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          )
        ) : (
          <Body d={query.data.data} />
        )}
      </div>
    </MetricDefinitionProvider>
  );
}
