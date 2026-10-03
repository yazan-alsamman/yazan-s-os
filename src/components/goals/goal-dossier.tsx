"use client";

import { Info, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";

import { ChartCard } from "@/components/charts/chart-card";
import { EChart } from "@/components/charts/echart";
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
import { ErrorState, ListSkeleton } from "@/components/data/states";
import { EntityFormDialog } from "@/components/forms/entity-form";
import { percent } from "@/components/projects/dossier";
import {
  labelOf,
  MILESTONE_STATUS_OPTIONS,
  PROJECT_HEALTH_OPTIONS,
  PROJECT_STATUS_OPTIONS,
} from "@/components/records/options";
import { FRESHNESS_LABEL, FRESHNESS_TONE, GAP_LABEL } from "@/components/skills/skill-dossier";
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
import { useApiGet, useApiList, useApiMutation } from "@/lib/api/hooks";
import { ApiError, errorMessage } from "@/lib/http/fetch-json";
import { useReturnFocus } from "@/lib/ui/return-focus";
import type { GoalRow, GoalDossierDto } from "@/modules/goals/goal-intelligence";
import { canBeParent, GOAL_TRANSITIONS, GOAL_TYPE_LABEL } from "@/modules/goals/goal.rules";

import { GoalStatusBadge, RiskBadge } from "./goals-list";
import {
  ATTAINMENT_LABEL,
  ATTAINMENT_TONE,
  childTypeOptions,
  GOAL_CONFIDENCE_OPTIONS,
  GOAL_EDIT_FIELDS,
  goalCreateFields,
  MEASUREMENT_FIELDS,
  RISK_LABEL,
  TRANSITION_LABEL,
} from "./options";

/** Every cached view a goal change can affect (lists, analytics, Command Center, other dossiers). */
const GOAL_INVALIDATES = ["goals", "milestones", "projects", "skills", "analytics", "search"];

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "progress", label: "Progress" },
  { id: "measurements", label: "Measurements" },
  { id: "milestones", label: "Milestones" },
  { id: "projects", label: "Projects" },
  { id: "skills", label: "Skills" },
  { id: "hierarchy", label: "Hierarchy" },
  { id: "dependencies", label: "Dependencies" },
];

const n = (v: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(v);

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
      aria-labelledby={`${id}-title`}
      className="scroll-mt-20 rounded-lg border bg-surface"
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-h3 font-semibold">
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

function Fact({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border bg-surface-sunken/40 p-2.5">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-h3 font-semibold">{value}</dd>
      {sub && <dd className="text-caption text-muted-foreground">{sub}</dd>}
    </div>
  );
}

export function useGoalDossier(goalId: string) {
  return useApiGet<{ data: GoalDossierDto }>(
    ["goals", "dossier", goalId],
    `/api/v1/goals/${goalId}/intelligence`,
  );
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

function CompleteDialog({
  open,
  onOpenChange,
  today,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
  onConfirm: (completedAt: string) => Promise<unknown>;
}) {
  const returnFocus = useReturnFocus();
  const id = useId();
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" {...returnFocus}>
        <DialogHeader>
          <DialogTitle>Mark goal completed</DialogTitle>
          <DialogDescription>
            Completion is your decision and is recorded separately from attainment and milestone
            progress. The completion date cannot be in the future.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          <label htmlFor={id} className="text-caption text-muted-foreground">
            Completion date
          </label>
          <Input
            id={id}
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
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
  goal,
  today,
  onTransition,
}: {
  goal: GoalDossierDto["goal"];
  today: string;
  onTransition: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const run = async (status: string) => {
    setPending(true);
    setError(null);
    try {
      await onTransition({ status });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Lifecycle actions">
        {GOAL_TRANSITIONS[goal.status].map((to) => (
          <Button
            key={to}
            variant={to === "cancelled" ? "outline" : "secondary"}
            size="sm"
            disabled={pending}
            onClick={() =>
              to === "completed"
                ? setCompleting(true)
                : void run(to === "active" && goal.status === "completed" ? "active" : to)
            }
          >
            {goal.status === "completed" && to === "active" ? "Reopen" : TRANSITION_LABEL[to]}
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

// ── Progress ────────────────────────────────────────────────────────────────

function ProgressSection({ d }: { d: GoalDossierDto }) {
  const showDefinition = useShowDefinition();
  const m = d.signals.milestones;
  const a = d.attainment;
  return (
    <Section
      id="progress"
      title="Progress"
      description="Three separate views — never combined into one score. Attainment comes from your measurements, milestone progress from linked milestones, and confidence is your own assessment."
      action={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="How target attainment is calculated"
          onClick={() => showDefinition("goals.target_attainment")}
        >
          <Info aria-hidden />
        </Button>
      }
    >
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Fact
          label="Target attainment (derived)"
          value={
            <Badge tone={ATTAINMENT_TONE[a.state]}>
              {a.progress === null
                ? ATTAINMENT_LABEL[a.state]
                : `${ATTAINMENT_LABEL[a.state]} · ${percent(a.progress)}`}
            </Badge>
          }
          sub={a.explanation}
        />
        <Fact
          label="Milestone progress (derived)"
          value={m.total === 0 ? "No milestones linked" : `${m.completed} of ${m.total} completed`}
          sub={
            m.total === 0
              ? "Link milestones to see delivery progress."
              : [
                  m.ratio === null ? null : `${percent(m.ratio)} of linked milestones`,
                  m.overdue ? `${m.overdue} overdue` : null,
                  m.blocked ? `${m.blocked} blocked` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
          }
        />
        <Fact
          label="Confidence (manual)"
          value={
            d.goal.confidence ? labelOf(GOAL_CONFIDENCE_OPTIONS, d.goal.confidence) : "Not set"
          }
          sub="Self-assessed; not used in any calculation."
        />
      </dl>
      <p className="mt-3 text-caption text-muted-foreground">
        Model: {a.model}. Progress = (latest − baseline) ÷ (target − baseline); a lower target than
        the baseline means lower is better. Missing inputs make attainment “not computable”, never 0
        %. Milestone progress counts milestones linked to this goal only.{" "}
        <button
          type="button"
          className="underline underline-offset-4"
          onClick={() => showDefinition("goals.milestone_progress")}
        >
          Milestone progress definition
        </button>
      </p>
    </Section>
  );
}

function RiskPanel({ d }: { d: GoalDossierDto }) {
  const showDefinition = useShowDefinition();
  return (
    <Panel
      title="Risk"
      action={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="How goal risk is assessed"
          onClick={() => showDefinition("goals.at_risk")}
        >
          <Info aria-hidden />
        </Button>
      }
    >
      <p className="flex flex-wrap items-center gap-2">
        <RiskBadge state={d.risk.state} />
        <span className="text-caption text-muted-foreground">{d.risk.model}</span>
      </p>
      {d.risk.signals.length > 0 ? (
        <ul className="mt-2 list-disc pl-5" aria-label="Risk signals">
          {d.risk.signals.map((s) => (
            <li key={s.key}>
              {s.label}
              {s.count !== undefined && <span className="tabular"> ({s.count})</span>}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2 text-caption text-muted-foreground">{d.risk.explanation}</p>
    </Panel>
  );
}

// ── Measurements ────────────────────────────────────────────────────────────

function MeasurementsSection({ d }: { d: GoalDossierDto }) {
  const showDefinition = useShowDefinition();
  const g = d.goal;
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<{ id: string; date: string } | null>(null);
  const add = useApiMutation<Record<string, unknown>>(
    "POST",
    `/api/v1/goals/${g.id}/measurements`,
    GOAL_INVALIDATES,
  );
  const remove = useApiMutation<{ id: string }>(
    "DELETE",
    (b) => `/api/v1/goals/${g.id}/measurements/${b.id}`,
    GOAL_INVALIDATES,
  );
  const measurable = g.baseline !== null && g.target !== null;
  const points = d.measurements;
  const unit = g.unit ? ` ${g.unit}` : "";
  const latest = points.at(-1);

  return (
    <Section
      id="measurements"
      title={`Measurements (${points.length})`}
      description={
        g.metric
          ? `Recorded values of “${g.metric}”${unit ? ` (${g.unit})` : ""}. Only values you record are shown — nothing is interpolated.`
          : "Recorded values of the goal's metric. Only values you record are shown — nothing is interpolated."
      }
      action={
        <Button size="sm" onClick={() => setAdding(true)} disabled={!measurable}>
          <Plus aria-hidden />
          Add measurement
        </Button>
      }
    >
      {!measurable && (
        <p className="mb-3 text-muted-foreground">
          Set a baseline and a target (Edit) before recording measurements — without them progress
          cannot be interpreted.
        </p>
      )}
      {points.length === 0 ? (
        <p className="text-muted-foreground">No measurement is recorded yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <ChartCard
            title="Goal burndown"
            interpretation={
              latest
                ? `Latest ${n(latest.value)}${unit} on ${formatDate(latest.date)}; baseline ${g.baseline === null ? "not set" : `${n(g.baseline)}${unit}`}, target ${g.target === null ? "not set" : `${n(g.target)}${unit}`}.`
                : null
            }
            meta={`Recorded measurements · evaluated ${formatDate(d.evaluatedOn)} (UTC)`}
            onShowDefinition={() => showDefinition("goals.burndown")}
            csvName="goal-measurements"
            table={{
              caption: "Recorded measurements",
              columns: [`Value${unit}`],
              rows: points.map((p) => ({ label: p.date, values: [p.value] })),
            }}
          >
            <EChart
              dataKey={JSON.stringify([points, g.baseline, g.target])}
              height={220}
              ariaLabel={`Line chart of ${points.length} recorded measurements from ${formatDate(points[0]!.date)} to ${formatDate(latest!.date)}, latest ${n(latest!.value)}${unit}.`}
              option={(p) => ({
                grid: { left: 8, right: 64, top: 16, bottom: 8, containLabel: true },
                tooltip: { trigger: "axis" },
                xAxis: {
                  type: "time",
                  axisLabel: { color: p.mutedText },
                  splitLine: { show: false },
                },
                yAxis: {
                  type: "value",
                  scale: true,
                  axisLabel: { color: p.mutedText },
                  splitLine: { lineStyle: { color: p.grid } },
                },
                series: [
                  {
                    name: g.metric ?? "Value",
                    type: "line",
                    data: points.map((x) => [x.date, x.value]),
                    itemStyle: { color: p.brand },
                    lineStyle: { color: p.brand },
                    symbolSize: 7,
                    markLine: {
                      symbol: "none",
                      label: { color: p.text, formatter: "{b}" },
                      data: [
                        ...(g.baseline === null
                          ? []
                          : [
                              {
                                name: "Baseline",
                                yAxis: g.baseline,
                                lineStyle: { color: p.neutral, type: "dashed" },
                              },
                            ]),
                        ...(g.target === null
                          ? []
                          : [
                              {
                                name: "Target",
                                yAxis: g.target,
                                lineStyle: { color: p.success, type: "solid" },
                              },
                            ]),
                      ],
                    },
                  },
                ],
              })}
            />
          </ChartCard>
          <div
            className="relative min-w-0 overflow-x-auto"
            role="region"
            aria-label="Measurements table (scrolls horizontally on small screens)"
            tabIndex={0}
          >
            <table className="w-full min-w-[28rem] text-body">
              <caption className="sr-only">Recorded measurements, oldest first</caption>
              <thead className="text-caption text-muted-foreground">
                <tr>
                  <th scope="col" className="py-1 pr-3 text-left font-medium">
                    Date
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">
                    Value
                  </th>
                  <th scope="col" className="py-1 pr-3 text-left font-medium">
                    Note
                  </th>
                  <th scope="col" className="w-12 py-1">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {points.map((p) => (
                  <tr key={p.id}>
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal tabular">
                      {formatDate(p.date)}
                    </th>
                    <td className="py-1.5 pr-3 text-right tabular">
                      {n(p.value)}
                      {unit}
                    </td>
                    <td className="py-1.5 pr-3">{p.note ?? ""}</td>
                    <td className="py-1 text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete measurement of ${formatDate(p.date)}`}
                        onClick={() => setDeleting({ id: p.id, date: p.date })}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <EntityFormDialog
        open={adding}
        onOpenChange={setAdding}
        title="Add measurement"
        description="Record a real observed value. The date cannot be in the future."
        fields={MEASUREMENT_FIELDS.map((f) =>
          f.name === "date" ? { ...f, defaultValue: d.evaluatedOn } : f,
        )}
        submitLabel="Add measurement"
        onSubmit={(payload) => add.mutateAsync(payload)}
      />
      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete measurement?"
        description={`The measurement of ${deleting ? formatDate(deleting.date) : ""} will be permanently deleted. The deletion is recorded in the audit log.`}
        onConfirm={() => remove.mutateAsync({ id: deleting!.id })}
      />
    </Section>
  );
}

// ── Hierarchy ───────────────────────────────────────────────────────────────

function ParentDialog({
  open,
  onOpenChange,
  goal,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: GoalDossierDto["goal"];
  onSave: (parentId: string | null) => Promise<unknown>;
}) {
  const returnFocus = useReturnFocus();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" {...returnFocus}>
        <DialogHeader>
          <DialogTitle>Parent goal</DialogTitle>
          <DialogDescription>
            A parent must be a higher level: North Star → Annual objective → Quarterly goal.
          </DialogDescription>
        </DialogHeader>
        {open && <ParentForm goal={goal} onSave={onSave} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}

function ParentForm({
  goal,
  onSave,
  onOpenChange,
}: {
  goal: GoalDossierDto["goal"];
  onSave: (parentId: string | null) => Promise<unknown>;
  onOpenChange: (open: boolean) => void;
}) {
  const selectId = useId();
  const searchId = useId();
  const [q, setQ] = useState("");
  const [value, setValue] = useState(goal.parentId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const options = useApiList<GoalRow>("goals", "/api/v1/goals", {
    q: q.trim() || undefined,
    pageSize: 100,
    sort: "title",
  });
  const candidates = (options.data?.data ?? []).filter(
    (g) => g.id !== goal.id && canBeParent(g.type, goal.type),
  );
  if (goal.type === "north_star") {
    return (
      <p className="text-muted-foreground">
        A North Star is the top level and has no parent.
        <Button variant="outline" className="mt-3 block" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={searchId} className="text-caption text-muted-foreground">
          Filter goals
        </label>
        <Input id={searchId} type="search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={selectId} className="text-caption text-muted-foreground">
          Parent
        </label>
        {options.isPending ? (
          <ListSkeleton rows={1} />
        ) : (
          <NativeSelect id={selectId} value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">No parent (top level)</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} — {GOAL_TYPE_LABEL[c.type]}
              </option>
            ))}
          </NativeSelect>
        )}
        {options.data && options.data.page.total > 100 && (
          <p className="text-caption text-muted-foreground">
            Showing the first 100 matches; filter to narrow the list.
          </p>
        )}
      </div>
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
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            setError(null);
            try {
              await onSave(value || null);
              onOpenChange(false);
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ── Dossier ─────────────────────────────────────────────────────────────────

type Picker = "projects" | "skills" | "milestones" | "dependencies" | null;

function GoalDossierBody({ d }: { d: GoalDossierDto }) {
  const router = useRouter();
  const g = d.goal;
  const path = `/api/v1/goals/${g.id}`;
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [parenting, setParenting] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);
  const update = useApiMutation<Record<string, unknown>>("PATCH", path, GOAL_INVALIDATES);
  const remove = useApiMutation<void>("DELETE", path, GOAL_INVALIDATES);
  const createChild = useApiMutation<Record<string, unknown>>(
    "POST",
    "/api/v1/goals",
    GOAL_INVALIDATES,
  );
  const setProjects = useApiMutation<{ projectIds: string[] }>(
    "PUT",
    `${path}/projects`,
    GOAL_INVALIDATES,
  );
  const setSkills = useApiMutation<{ skillIds: string[] }>(
    "PUT",
    `${path}/skills`,
    GOAL_INVALIDATES,
  );
  const setMilestones = useApiMutation<{ milestoneIds: string[] }>(
    "PUT",
    `${path}/milestones`,
    GOAL_INVALIDATES,
  );
  const setDependencies = useApiMutation<{ goalIds: string[] }>(
    "PUT",
    `${path}/dependencies`,
    GOAL_INVALIDATES,
  );
  const childTypes = childTypeOptions(g.type);
  const manage = (kind: Exclude<Picker, null>, label: string) => (
    <Button variant="outline" size="sm" onClick={() => setPicker(kind)} aria-label={label}>
      Manage
    </Button>
  );

  return (
    <>
      <DetailHeader
        title={g.title}
        subtitle={GOAL_TYPE_LABEL[g.type]}
        badges={
          <>
            <GoalStatusBadge status={g.status} />
            {d.overdue && <Badge tone="danger">Overdue</Badge>}
            <RiskBadge state={d.risk.state} />
            {g.completedAt && <Badge tone="success">Completed {formatDate(g.completedAt)}</Badge>}
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
          goal={g}
          today={d.evaluatedOn}
          onTransition={(body) => update.mutateAsync(body)}
        />
      </div>
      <nav aria-label="Goal sections" className="mb-4 overflow-x-auto">
        <ul className="flex gap-1 border-b pb-1 text-body">
          {SECTIONS.map((s) => (
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

      <div className="flex flex-col gap-4">
        <div id="overview" className="grid scroll-mt-20 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Panel title="Goal">
              <FieldGrid
                items={[
                  { label: "Outcome", value: g.outcome, wide: true },
                  { label: "Description", value: g.description, wide: true },
                  {
                    label: "Metric",
                    value: g.metric ? `${g.metric}${g.unit ? ` (${g.unit})` : ""}` : null,
                  },
                  {
                    label: "Baseline → target",
                    value:
                      g.baseline === null && g.target === null
                        ? "No target configured"
                        : `${g.baseline === null ? "not set" : n(g.baseline)} → ${g.target === null ? "not set" : n(g.target)}${g.unit ? ` ${g.unit}` : ""}`,
                  },
                  { label: "Start date", value: formatDate(g.startDate) },
                  {
                    label: "Deadline",
                    value: g.deadline ? formatDate(g.deadline) : "No deadline",
                  },
                  { label: "Completed", value: formatDate(g.completedAt) },
                  {
                    label: "Confidence (self-assessed)",
                    value: g.confidence ? labelOf(GOAL_CONFIDENCE_OPTIONS, g.confidence) : null,
                  },
                ]}
              />
              <p className="mt-3 text-caption text-muted-foreground">
                Entered manually in PEOS. Derived values below are recalculated from linked records
                on every view (evaluated {formatDate(d.evaluatedOn)}, UTC).
              </p>
            </Panel>
          </div>
          <RiskPanel d={d} />
        </div>

        <ProgressSection d={d} />
        <MeasurementsSection d={d} />

        <Section
          id="milestones"
          title={`Milestones (${d.milestones.length})`}
          description="Project milestones that count toward this goal. A milestone counts toward one goal only, so nothing is double-counted."
          action={manage("milestones", "Manage milestones")}
        >
          {d.milestones.length === 0 ? (
            <p className="text-muted-foreground">
              No milestones are linked. Milestones belong to projects; link existing ones here.
            </p>
          ) : (
            <ul className="divide-y">
              {d.milestones.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                  <span className="min-w-0 basis-full font-medium sm:flex-1 sm:basis-auto">
                    {m.title}
                  </span>
                  <Link
                    href={`/projects/${m.project.id}#milestones` as never}
                    className="text-caption underline underline-offset-4"
                  >
                    {m.project.name}
                  </Link>
                  <Badge
                    tone={
                      m.status === "completed"
                        ? "success"
                        : m.status === "blocked"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {labelOf(MILESTONE_STATUS_OPTIONS, m.status)}
                  </Badge>
                  {m.overdue && <Badge tone="danger">Overdue</Badge>}
                  <span className="text-caption text-muted-foreground tabular">
                    {m.completedAt
                      ? `Completed ${formatDate(m.completedAt)}`
                      : m.dueDate
                        ? `Planned ${formatDate(m.dueDate)}`
                        : "No planned date"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section
            id="projects"
            title={`Projects (${d.projects.length})`}
            description="Projects contributing to this goal. Manual health is your own assessment."
            action={manage("projects", "Manage projects")}
          >
            {d.projects.length === 0 ? (
              <p className="text-muted-foreground">No linked projects.</p>
            ) : (
              <ul className="divide-y">
                {d.projects.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-1.5"
                  >
                    <Link
                      href={`/projects/${p.id}` as never}
                      className="font-medium hover:underline"
                    >
                      {p.name}
                    </Link>
                    <span className="flex flex-wrap gap-1">
                      <Badge>{labelOf(PROJECT_STATUS_OPTIONS, p.status)}</Badge>
                      <Badge>Health: {labelOf(PROJECT_HEALTH_OPTIONS, p.healthStatus)}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            id="hierarchy"
            title="Hierarchy"
            description="North Star → Annual objective → Quarterly goal."
            action={
              <>
                {g.type !== "north_star" && (
                  <Button variant="outline" size="sm" onClick={() => setParenting(true)}>
                    Change parent
                  </Button>
                )}
                {childTypes.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setAddingChild(true)}>
                    <Plus aria-hidden />
                    Add child goal
                  </Button>
                )}
              </>
            }
          >
            <h3 className="text-body font-semibold">Parent</h3>
            {d.parent ? (
              <p className="mt-1 flex flex-wrap items-center gap-2">
                <Link
                  href={`/goals/${d.parent.id}` as never}
                  className="font-medium hover:underline"
                >
                  {d.parent.title}
                </Link>
                <Badge>{GOAL_TYPE_LABEL[d.parent.type]}</Badge>
                <GoalStatusBadge status={d.parent.status} />
              </p>
            ) : (
              <p className="mt-1 text-muted-foreground">
                {g.type === "north_star" ? "A North Star is the top level." : "No parent goal."}
              </p>
            )}
            <h3 className="mt-3 text-body font-semibold">Children ({d.children.length})</h3>
            {d.children.length === 0 ? (
              <p className="mt-1 text-muted-foreground">No child goals.</p>
            ) : (
              <ul className="mt-1 divide-y">
                {d.children.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-1.5"
                  >
                    <Link href={`/goals/${c.id}` as never} className="font-medium hover:underline">
                      {c.title}
                    </Link>
                    <span className="flex flex-wrap items-center gap-1">
                      <Badge>{GOAL_TYPE_LABEL[c.type]}</Badge>
                      <GoalStatusBadge status={c.status} />
                      {c.deadline && (
                        <span className="text-caption text-muted-foreground tabular">
                          {formatDate(c.deadline)}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <Section
          id="skills"
          title={`Skills (${d.skills.length})`}
          description="Skills this goal needs. Levels, gaps and freshness come from skill intelligence (evidence-derived) — the same values as on each skill's page."
          action={manage("skills", "Manage skills")}
        >
          {d.skills.length === 0 ? (
            <p className="text-muted-foreground">No linked skills.</p>
          ) : (
            <div
              className="overflow-x-auto"
              role="region"
              aria-label="Linked skills table (scrolls horizontally on small screens)"
              tabIndex={0}
            >
              <table className="w-full min-w-[36rem] text-body">
                <caption className="sr-only">Linked skills with evidence-derived levels</caption>
                <thead className="text-caption text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-1 pr-3 text-left font-medium">
                      Skill
                    </th>
                    <th scope="col" className="py-1 pr-3 text-left font-medium">
                      Derived level
                    </th>
                    <th scope="col" className="py-1 pr-3 text-left font-medium">
                      Target
                    </th>
                    <th scope="col" className="py-1 pr-3 text-left font-medium">
                      Gap
                    </th>
                    <th scope="col" className="py-1 text-left font-medium">
                      Freshness
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {d.skills.map((s) => (
                    <tr key={s.id}>
                      <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                        <Link href={`/skills/${s.id}` as never} className="hover:underline">
                          {s.name}
                        </Link>
                      </th>
                      <td className="py-1.5 pr-3">
                        {s.current.level === null
                          ? "Not enough evidence"
                          : `${s.current.level} — ${s.current.label}`}
                      </td>
                      <td className="py-1.5 pr-3">
                        {s.target.level === null || s.target.level < 1
                          ? "Not configured"
                          : `${s.target.level} — ${s.target.label}`}
                      </td>
                      <td className="py-1.5 pr-3">
                        <span className="inline-flex flex-wrap gap-1">
                          {GAP_LABEL[s.gap.state] ?? s.gap.state}
                          {s.gap.critical && <Badge tone="danger">Critical</Badge>}
                        </span>
                      </td>
                      <td className="py-1.5">
                        <Badge tone={FRESHNESS_TONE[s.freshness.state]}>
                          {FRESHNESS_LABEL[s.freshness.state]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section
          id="dependencies"
          title="Dependencies"
          description="Goals this goal waits on, and goals waiting on it. A cancelled or overdue dependency is a risk signal."
          action={manage("dependencies", "Manage dependencies")}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-body font-semibold">Depends on ({d.dependsOn.length})</h3>
              {d.dependsOn.length === 0 ? (
                <p className="mt-1 text-muted-foreground">No dependencies.</p>
              ) : (
                <ul className="mt-1 divide-y">
                  {d.dependsOn.map((x) => (
                    <li
                      key={x.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-1.5"
                    >
                      <Link
                        href={`/goals/${x.id}` as never}
                        className="font-medium hover:underline"
                      >
                        {x.title}
                      </Link>
                      {x.state === "overdue" ? (
                        <Badge tone="danger">Overdue</Badge>
                      ) : x.state === "cancelled" ? (
                        <Badge tone="danger">Cancelled</Badge>
                      ) : (
                        <GoalStatusBadge status={x.state} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-body font-semibold">Needed by ({d.dependents.length})</h3>
              {d.dependents.length === 0 ? (
                <p className="mt-1 text-muted-foreground">No goal depends on this one.</p>
              ) : (
                <ul className="mt-1 divide-y">
                  {d.dependents.map((x) => (
                    <li
                      key={x.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-1.5"
                    >
                      <Link
                        href={`/goals/${x.id}` as never}
                        className="font-medium hover:underline"
                      >
                        {x.title}
                      </Link>
                      <GoalStatusBadge status={x.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Section>
        <p className="text-caption text-muted-foreground">
          See this goal in context on the{" "}
          <Link href="/goals/roadmap" className="underline underline-offset-4">
            roadmap
          </Link>
          . Risk is {RISK_LABEL[d.risk.state].toLowerCase()} under {d.risk.model}.
        </p>
      </div>

      <EntityFormDialog
        open={editing}
        onOpenChange={setEditing}
        title="Edit goal"
        description="Status changes use the lifecycle actions. Fields marked * are required."
        fields={GOAL_EDIT_FIELDS}
        initial={g}
        submitLabel="Save changes"
        onSubmit={(payload) => update.mutateAsync(payload)}
      />
      <EntityFormDialog
        open={addingChild}
        onOpenChange={setAddingChild}
        title={`New child goal of “${g.title}”`}
        fields={goalCreateFields(childTypes)}
        submitLabel="Create child goal"
        onSubmit={(payload) => createChild.mutateAsync({ ...payload, parentId: g.id })}
      />
      <ParentDialog
        open={parenting}
        onOpenChange={setParenting}
        goal={g}
        onSave={(parentId) => update.mutateAsync({ parentId })}
      />
      <ConfirmDelete
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete goal?"
        description={`“${g.title}”, its measurements and its links to projects, skills and dependencies will be permanently deleted; linked milestones stay in their projects. Goals with child goals cannot be deleted — move or delete the children first. The deletion is recorded in the audit log.`}
        onConfirm={async () => {
          await remove.mutateAsync();
          router.replace("/goals");
        }}
      />
      <RelationPicker
        open={picker === "projects"}
        onOpenChange={(o) => !o && setPicker(null)}
        title="Goal projects"
        description="Select every project that contributes to this goal."
        resource="projects"
        path="/api/v1/projects"
        optionLabel={(r) => String(r.name)}
        initial={d.projects.map((p) => ({ id: p.id, label: p.name }))}
        onSave={(items) => setProjects.mutateAsync({ projectIds: items.map((i) => i.id) })}
      />
      <RelationPicker
        open={picker === "skills"}
        onOpenChange={(o) => !o && setPicker(null)}
        title="Goal skills"
        description="Select the skills this goal needs. Their levels come from skill intelligence."
        resource="skills"
        path="/api/v1/skills"
        optionLabel={(r) => String(r.name)}
        initial={d.skills.map((s) => ({ id: s.id, label: s.name }))}
        onSave={(items) => setSkills.mutateAsync({ skillIds: items.map((i) => i.id) })}
      />
      <RelationPicker
        open={picker === "milestones"}
        onOpenChange={(o) => !o && setPicker(null)}
        title="Goal milestones"
        description="Select the project milestones that count toward this goal. A milestone already counting toward another goal must be unlinked there first."
        resource="milestones"
        path="/api/v1/milestones"
        optionLabel={(r) =>
          `${String(r.title)} · ${String((r.project as { name?: string } | undefined)?.name ?? "")}`
        }
        initial={d.milestones.map((m) => ({ id: m.id, label: m.title }))}
        onSave={(items) => setMilestones.mutateAsync({ milestoneIds: items.map((i) => i.id) })}
      />
      <RelationPicker
        open={picker === "dependencies"}
        onOpenChange={(o) => !o && setPicker(null)}
        title="Goal dependencies"
        description="Select the goals this goal depends on. Cycles are rejected."
        resource="goals"
        path="/api/v1/goals"
        optionLabel={(r) => String(r.title)}
        exclude={[g.id]}
        initial={d.dependsOn.map((x) => ({ id: x.id, label: x.title }))}
        onSave={(items) => setDependencies.mutateAsync({ goalIds: items.map((i) => i.id) })}
      />
    </>
  );
}

export function GoalDossier({ id }: { id: string }) {
  const query = useGoalDossier(id);
  return (
    <MetricDefinitionProvider>
      <div>
        <BackLink href="/goals" label="All goals" />
        {query.isPending ? (
          <DetailSkeleton />
        ) : query.isError ? (
          query.error instanceof ApiError && query.error.status === 404 ? (
            <div role="alert" className="rounded-lg border bg-surface p-6">
              <h1 className="text-h2 font-semibold">Goal not found</h1>
              <p className="mt-1 text-muted-foreground">This goal does not exist or was deleted.</p>
            </div>
          ) : (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          )
        ) : (
          <GoalDossierBody d={query.data.data} />
        )}
      </div>
    </MetricDefinitionProvider>
  );
}
