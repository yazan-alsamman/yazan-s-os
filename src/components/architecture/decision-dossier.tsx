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
import { ErrorState, ListSkeleton } from "@/components/data/states";
import { EntityFormDialog } from "@/components/forms/entity-form";
import { labelOf, PROJECT_STATUS_OPTIONS } from "@/components/records/options";
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
import type {
  DecisionDossierDto,
  DecisionRow,
} from "@/modules/architecture/architecture-intelligence";
import { DECISION_TRANSITIONS } from "@/modules/architecture/architecture.rules";

import { DecisionStatusBadge } from "./architecture-lists";
import {
  ALTERNATIVE_FIELDS,
  COMPONENT_TYPE_LABEL,
  DECISION_EDIT_FIELDS,
  DECISION_STATUS_LABEL,
  DOCUMENTATION_PART_LABEL,
  TRANSITION_LABEL,
} from "./options";

const INVALIDATES = ["architecture", "analytics", "projects", "evidence", "search"];
type Status = DecisionDossierDto["decision"]["status"];

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

// ── Lifecycle ───────────────────────────────────────────────────────────────

function TransitionDialog({
  open,
  onOpenChange,
  to,
  decisionId,
  today,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  to: Status | null;
  decisionId: string;
  today: string;
  onConfirm: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  const returnFocus = useReturnFocus();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" {...returnFocus}>
        <DialogHeader>
          <DialogTitle>
            {to === "superseded"
              ? "Supersede this decision"
              : `${to ? TRANSITION_LABEL[to] : ""} decision`}
          </DialogTitle>
          <DialogDescription>
            {to === "superseded"
              ? "Choose the decision that replaces this one. This decision stays in the history as superseded."
              : "Record when the decision was made. The date cannot be in the future."}
          </DialogDescription>
        </DialogHeader>
        {open && to && (
          <TransitionForm
            to={to}
            decisionId={decisionId}
            today={today}
            onConfirm={onConfirm}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TransitionForm({
  to,
  decisionId,
  today,
  onConfirm,
  onOpenChange,
}: {
  to: Status;
  decisionId: string;
  today: string;
  onConfirm: (body: Record<string, unknown>) => Promise<unknown>;
  onOpenChange: (o: boolean) => void;
}) {
  const dateId = useId();
  const selectId = useId();
  const [date, setDate] = useState(today);
  const [successor, setSuccessor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const candidates = useApiList<DecisionRow>("architecture", "/api/v1/architecture/decisions", {
    pageSize: 100,
    sort: "title",
  });
  const options = (candidates.data?.data ?? []).filter(
    (d) => d.id !== decisionId && d.status !== "rejected",
  );
  const supersede = to === "superseded";
  return (
    <div className="flex flex-col gap-3">
      {supersede ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={selectId} className="text-caption text-muted-foreground">
            Superseded by
          </label>
          {candidates.isPending ? (
            <ListSkeleton rows={1} />
          ) : (
            <NativeSelect
              id={selectId}
              value={successor}
              onChange={(e) => setSuccessor(e.target.value)}
            >
              <option value="">Choose a decision…</option>
              {options.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} ({DECISION_STATUS_LABEL[d.status]})
                </option>
              ))}
            </NativeSelect>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor={dateId} className="text-caption text-muted-foreground">
            Decision date
          </label>
          <Input
            id={dateId}
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      )}
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
          disabled={saving || (supersede ? !successor : !date)}
          onClick={async () => {
            setSaving(true);
            setError(null);
            try {
              await onConfirm(
                supersede
                  ? { status: to, supersededById: successor }
                  : { status: to, decidedAt: date },
              );
              onOpenChange(false);
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : TRANSITION_LABEL[to]?.replace("…", "")}
        </Button>
      </DialogFooter>
    </div>
  );
}

function LifecycleActions({
  d,
  onTransition,
}: {
  d: DecisionDossierDto;
  onTransition: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  const [dialogFor, setDialogFor] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const status = d.decision.status;
  const direct = async (to: Status) => {
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
        {DECISION_TRANSITIONS[status].map((to) => (
          <Button
            key={to}
            variant={to === "accepted" || to === "proposed" ? "secondary" : "outline"}
            size="sm"
            disabled={pending}
            onClick={() =>
              to === "superseded" ||
              (status === "proposed" && (to === "accepted" || to === "rejected"))
                ? setDialogFor(to)
                : void direct(to)
            }
          >
            {(status === "superseded" || status === "deprecated") && to === "accepted"
              ? "Reinstate"
              : TRANSITION_LABEL[to]}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
      <TransitionDialog
        open={dialogFor !== null}
        onOpenChange={(o) => !o && setDialogFor(null)}
        to={dialogFor}
        decisionId={d.decision.id}
        today={d.evaluatedOn}
        onConfirm={onTransition}
      />
    </div>
  );
}

// ── Dossier ─────────────────────────────────────────────────────────────────

type Picker = "projects" | "components" | "evidence" | null;

function Body({ d }: { d: DecisionDossierDto }) {
  const router = useRouter();
  const showDefinition = useShowDefinition();
  const dec = d.decision;
  const path = `/api/v1/architecture/decisions/${dec.id}`;
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingAlt, setAddingAlt] = useState(false);
  const [editingAlt, setEditingAlt] = useState<DecisionDossierDto["alternatives"][number] | null>(
    null,
  );
  const [deletingAlt, setDeletingAlt] = useState<{ id: string; name: string } | null>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const update = useApiMutation<Record<string, unknown>>("PATCH", path, INVALIDATES);
  const remove = useApiMutation<void>("DELETE", path, INVALIDATES);
  const addAlt = useApiMutation<Record<string, unknown>>(
    "POST",
    `${path}/alternatives`,
    INVALIDATES,
  );
  const updateAlt = useApiMutation<Record<string, unknown> & { id: string }>(
    "PATCH",
    (b) => `${path}/alternatives/${b.id}`,
    INVALIDATES,
  );
  const removeAlt = useApiMutation<{ id: string }>(
    "DELETE",
    (b) => `${path}/alternatives/${b.id}`,
    INVALIDATES,
  );
  const setProjects = useApiMutation<{ projectIds: string[] }>(
    "PUT",
    `${path}/projects`,
    INVALIDATES,
  );
  const setComponents = useApiMutation<{ componentIds: string[] }>(
    "PUT",
    `${path}/components`,
    INVALIDATES,
  );
  const setEvidence = useApiMutation<{ evidenceIds: string[] }>(
    "PUT",
    `${path}/evidence`,
    INVALIDATES,
  );
  const manage = (kind: Exclude<Picker, null>, label: string) => (
    <Button variant="outline" size="sm" onClick={() => setPicker(kind)} aria-label={label}>
      Manage
    </Button>
  );

  return (
    <>
      <DetailHeader
        title={dec.title}
        subtitle="Architecture decision record"
        badges={
          <>
            <DecisionStatusBadge status={dec.status} />
            {dec.decidedAt && <Badge>Decided {formatDate(dec.decidedAt)}</Badge>}
            {d.staleCritical ? (
              <Badge tone="danger">Stale critical</Badge>
            ) : d.revisitDue ? (
              <Badge tone="warning">Revisit due</Badge>
            ) : null}
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
        <LifecycleActions d={d} onTransition={(body) => update.mutateAsync(body)} />
      </div>

      <div className="flex flex-col gap-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Panel title="Decision record">
              <FieldGrid
                items={[
                  { label: "Context", value: dec.context, wide: true },
                  { label: "Problem", value: dec.problem, wide: true },
                  { label: "Constraints", value: dec.constraints, wide: true },
                  { label: "Decision", value: dec.decision, wide: true },
                  { label: "Consequences", value: dec.consequences, wide: true },
                ]}
              />
              <p className="mt-3 text-caption text-muted-foreground">
                Documented by you. PEOS never generates or infers architecture decisions.
              </p>
            </Panel>
          </div>
          <div className="flex flex-col gap-4">
            <Panel
              title="Revisit"
              action={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="How revisit and staleness are defined"
                  onClick={() => showDefinition("architecture.stale_critical_decisions")}
                >
                  <Info aria-hidden />
                </Button>
              }
            >
              <FieldGrid
                items={[
                  {
                    label: "Revisit date",
                    value: dec.revisitDate ? formatDate(dec.revisitDate) : "Not set",
                    wide: true,
                  },
                ]}
              />
              <p className="mt-2 text-caption text-muted-foreground">{d.revisit}</p>
            </Panel>
            <Panel title="Documentation gaps">
              {d.gaps.length === 0 ? (
                <p className="text-muted-foreground">Nothing missing.</p>
              ) : (
                <ul className="flex flex-wrap gap-1" aria-label="Missing parts">
                  {d.gaps.map((g) => (
                    <li key={g}>
                      <Badge tone="warning">{DOCUMENTATION_PART_LABEL[g]}</Badge>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-caption text-muted-foreground">
                A list of missing parts — not a score.
              </p>
            </Panel>
          </div>
        </div>

        <Section
          id="alternatives"
          title={`Alternatives (${d.alternatives.length})`}
          description="Options that were considered, with their trade-offs and why they were not chosen."
          action={
            <Button size="sm" onClick={() => setAddingAlt(true)}>
              <Plus aria-hidden />
              Add alternative
            </Button>
          }
        >
          {d.alternatives.length === 0 ? (
            <p className="text-muted-foreground">No alternatives recorded.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {d.alternatives.map((alt) => (
                <li key={alt.id} className="rounded-md border bg-surface-sunken/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">{alt.name}</h3>
                    <span className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit alternative ${alt.name}`}
                        onClick={() => setEditingAlt(alt)}
                      >
                        <Pencil aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete alternative ${alt.name}`}
                        onClick={() => setDeletingAlt({ id: alt.id, name: alt.name })}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </span>
                  </div>
                  <FieldGrid
                    items={[
                      { label: "Pros", value: alt.pros },
                      { label: "Cons", value: alt.cons },
                      { label: "Why not chosen", value: alt.rejectedReason, wide: true },
                    ]}
                  />
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section
            id="projects"
            title={`Related projects (${d.projects.length})`}
            description="Projects this decision belongs to (read from the Projects domain)."
            action={manage("projects", "Manage related projects")}
          >
            {d.projects.length === 0 ? (
              <p className="text-muted-foreground">Not linked to a project.</p>
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
                    <Badge>{labelOf(PROJECT_STATUS_OPTIONS, p.status)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section
            id="components"
            title={`Governed components (${d.components.length})`}
            description="Architecture components this decision applies to."
            action={manage("components", "Manage governed components")}
          >
            {d.components.length === 0 ? (
              <p className="text-muted-foreground">No components linked.</p>
            ) : (
              <ul className="divide-y">
                {d.components.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-1.5"
                  >
                    <Link
                      href={`/architecture/components/${c.id}` as never}
                      className="font-medium hover:underline"
                    >
                      {c.name}
                    </Link>
                    <span className="flex flex-wrap gap-1">
                      <Badge>{COMPONENT_TYPE_LABEL[c.type]}</Badge>
                      {c.critical && <Badge tone="danger">Critical</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <Section
          id="evidence"
          title={`Evidence (${d.evidence.length})`}
          description="Supporting evidence from the Evidence domain. Missing evidence is shown as missing."
          action={manage("evidence", "Manage evidence")}
        >
          {d.evidence.length === 0 ? (
            <p className="text-muted-foreground">No evidence linked.</p>
          ) : (
            <ul className="divide-y">
              {d.evidence.map((ev) => (
                <li key={ev.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                  <Link
                    href={`/evidence/${ev.id}` as never}
                    className="min-w-0 basis-full font-medium hover:underline sm:flex-1 sm:basis-auto"
                  >
                    {ev.title}
                  </Link>
                  {ev.verified ? <Badge tone="success">Verified</Badge> : <Badge>Unverified</Badge>}
                  <span className="text-caption text-muted-foreground tabular">
                    {ev.date ? formatDate(ev.date) : "Undated"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section
            id="supersession"
            title="Supersession"
            description="Superseded decisions stay in the history; reinstating clears the link (the audit log keeps it)."
          >
            <h3 className="text-body font-semibold">Superseded by</h3>
            {d.supersededBy ? (
              <p className="mt-1 flex flex-wrap items-center gap-2">
                <Link
                  href={`/architecture/${d.supersededBy.id}` as never}
                  className="font-medium hover:underline"
                >
                  {d.supersededBy.title}
                </Link>
                <DecisionStatusBadge status={d.supersededBy.status} />
              </p>
            ) : (
              <p className="mt-1 text-muted-foreground">Not superseded.</p>
            )}
            <h3 className="mt-3 text-body font-semibold">Supersedes ({d.supersedes.length})</h3>
            {d.supersedes.length === 0 ? (
              <p className="mt-1 text-muted-foreground">Supersedes no earlier decision.</p>
            ) : (
              <ul className="mt-1 divide-y">
                {d.supersedes.map((s) => (
                  <li key={s.id} className="py-1.5">
                    <Link
                      href={`/architecture/${s.id}` as never}
                      className="font-medium hover:underline"
                    >
                      {s.title}
                    </Link>
                    {s.decidedAt && (
                      <span className="ml-2 text-caption text-muted-foreground tabular">
                        decided {formatDate(s.decidedAt)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section
            id="history"
            title={`Decision history (${d.history.length})`}
            description="Recorded changes to this decision, from the audit log. Nothing is reconstructed."
          >
            <ol className="divide-y" aria-label="Decision history, oldest first">
              {d.history.map((h) => (
                <li key={h.id} className="flex flex-wrap gap-x-3 gap-y-0.5 py-1.5">
                  <time dateTime={h.at} className="w-44 text-caption text-muted-foreground tabular">
                    {new Date(h.at).toLocaleString()}
                  </time>
                  <span>
                    {h.action.replace(/_/g, " ")}
                    {h.from?.status && h.to?.status && h.from.status !== h.to.status
                      ? ` — ${DECISION_STATUS_LABEL[h.from.status as Status] ?? h.from.status} → ${DECISION_STATUS_LABEL[h.to.status as Status] ?? h.to.status}`
                      : ""}
                  </span>
                </li>
              ))}
            </ol>
          </Section>
        </div>
      </div>

      <EntityFormDialog
        open={editing}
        onOpenChange={setEditing}
        title="Edit decision"
        description="Status and supersession use the lifecycle actions. Fields marked * are required."
        fields={DECISION_EDIT_FIELDS}
        initial={dec}
        submitLabel="Save changes"
        onSubmit={(payload) => update.mutateAsync(payload)}
      />
      <ConfirmDelete
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete decision?"
        description={`“${dec.title}”, its alternatives and its links will be permanently deleted. A decision that supersedes others cannot be deleted. Consider deprecating instead to keep the history.`}
        onConfirm={async () => {
          await remove.mutateAsync();
          router.replace("/architecture");
        }}
      />
      <EntityFormDialog
        open={addingAlt}
        onOpenChange={setAddingAlt}
        title="Add alternative"
        fields={ALTERNATIVE_FIELDS}
        submitLabel="Add alternative"
        onSubmit={(payload) => addAlt.mutateAsync(payload)}
      />
      <EntityFormDialog
        open={editingAlt !== null}
        onOpenChange={(o) => !o && setEditingAlt(null)}
        title="Edit alternative"
        fields={ALTERNATIVE_FIELDS}
        initial={editingAlt as Record<string, unknown> | null}
        submitLabel="Save changes"
        onSubmit={(payload) => updateAlt.mutateAsync({ ...payload, id: editingAlt!.id })}
      />
      <ConfirmDelete
        open={deletingAlt !== null}
        onOpenChange={(o) => !o && setDeletingAlt(null)}
        title="Delete alternative?"
        description={`“${deletingAlt?.name ?? ""}” will be permanently deleted.`}
        onConfirm={() => removeAlt.mutateAsync({ id: deletingAlt!.id })}
      />
      <RelationPicker
        open={picker === "projects"}
        onOpenChange={(o) => !o && setPicker(null)}
        title="Related projects"
        description="Select the projects this decision belongs to."
        resource="projects"
        path="/api/v1/projects"
        optionLabel={(r) => String(r.name)}
        initial={d.projects.map((p) => ({ id: p.id, label: p.name }))}
        onSave={(items) => setProjects.mutateAsync({ projectIds: items.map((i) => i.id) })}
      />
      <RelationPicker
        open={picker === "components"}
        onOpenChange={(o) => !o && setPicker(null)}
        title="Governed components"
        description="Select the architecture components this decision applies to."
        resource="architecture"
        path="/api/v1/architecture/components"
        optionLabel={(r) => String(r.name)}
        initial={d.components.map((c) => ({ id: c.id, label: c.name }))}
        onSave={(items) => setComponents.mutateAsync({ componentIds: items.map((i) => i.id) })}
      />
      <RelationPicker
        open={picker === "evidence"}
        onOpenChange={(o) => !o && setPicker(null)}
        title="Decision evidence"
        description="Select the evidence that supports this decision."
        resource="evidence"
        path="/api/v1/evidence"
        optionLabel={(r) => String(r.title)}
        initial={d.evidence.map((e) => ({ id: e.id, label: e.title }))}
        onSave={(items) => setEvidence.mutateAsync({ evidenceIds: items.map((i) => i.id) })}
      />
    </>
  );
}

export function DecisionDossier({ id }: { id: string }) {
  const query = useApiGet<{ data: DecisionDossierDto }>(
    ["architecture", "decision", id],
    `/api/v1/architecture/decisions/${id}/intelligence`,
  );
  return (
    <MetricDefinitionProvider>
      <div>
        <BackLink href="/architecture" label="All decisions" />
        {query.isPending ? (
          <DetailSkeleton />
        ) : query.isError ? (
          query.error instanceof ApiError && query.error.status === 404 ? (
            <div role="alert" className="rounded-lg border bg-surface p-6">
              <h1 className="text-h2 font-semibold">Decision not found</h1>
              <p className="mt-1 text-muted-foreground">
                This decision does not exist or was deleted.
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
