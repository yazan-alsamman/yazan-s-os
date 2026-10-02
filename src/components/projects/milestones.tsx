"use client";

import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ConfirmDelete } from "@/components/data/confirm-delete";
import { formatDate } from "@/components/data/detail";
import { ResourceList } from "@/components/data/resource-list";
import { ErrorState, ListSkeleton } from "@/components/data/states";
import { EntityFormDialog, type FieldDescriptor } from "@/components/forms/entity-form";
import { labelOf, MILESTONE_STATUS_OPTIONS, YES_NO_OPTIONS } from "@/components/records/options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApiList, useApiMutation } from "@/lib/api/hooks";
import type { MilestoneDto } from "@/modules/milestones/milestone.repository";

/** Spec 04 Milestone fields (ADR 0022). */
export const MILESTONE_FIELDS: readonly FieldDescriptor[] = [
  { name: "title", label: "Title", kind: "text", required: true, maxLength: 200, wide: true },
  {
    name: "dueDate",
    label: "Planned date",
    kind: "date",
    description: "Optional. An open milestone becomes overdue the day after this date (UTC).",
  },
  {
    name: "status",
    label: "Status",
    kind: "select",
    options: MILESTONE_STATUS_OPTIONS,
    defaultValue: "planned",
  },
  {
    name: "completedAt",
    label: "Completed on",
    kind: "date",
    description: "Only for completed milestones. Left empty, today is used.",
  },
];

const STATUS_TONE = {
  planned: "neutral",
  in_progress: "info",
  blocked: "danger",
  completed: "success",
  cancelled: "neutral",
} as const;

export function MilestoneStatusBadge({ m }: { m: Pick<MilestoneDto, "status" | "overdue"> }) {
  return (
    <span className="flex flex-wrap gap-1">
      <Badge tone={STATUS_TONE[m.status]}>{labelOf(MILESTONE_STATUS_OPTIONS, m.status)}</Badge>
      {m.overdue && <Badge tone="danger">Overdue</Badge>}
    </span>
  );
}

const INVALIDATES = ["milestones", "projects", "search"];

/** Milestones inside the project dossier: create, edit, complete, reopen, delete. */
export function MilestoneManager({ projectId }: { projectId: string }) {
  const path = `/api/v1/projects/${projectId}/milestones`;
  const [page, setPage] = useState(1);
  const query = useApiList<MilestoneDto>("milestones", path, {
    page,
    pageSize: 50,
    sort: "dueDate",
  });
  const create = useApiMutation<Record<string, unknown>>("POST", path, INVALIDATES);
  const update = useApiMutation<Record<string, unknown> & { id: string }>(
    "PATCH",
    (b) => `/api/v1/milestones/${b.id}`,
    INVALIDATES,
  );
  const remove = useApiMutation<{ id: string }>(
    "DELETE",
    (b) => `/api/v1/milestones/${b.id}`,
    INVALIDATES,
  );
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MilestoneDto | null>(null);
  const [deleting, setDeleting] = useState<MilestoneDto | null>(null);
  const rows = query.data?.data ?? [];
  const info = query.data?.page;

  return (
    <section aria-labelledby="milestones-title" className="rounded-lg border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <h3 id="milestones-title" className="text-h3 font-semibold">
          Milestones{info ? ` (${info.total})` : ""}
        </h3>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus aria-hidden />
          Add milestone
        </Button>
      </div>
      {query.isPending ? (
        <ListSkeleton rows={3} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <p className="p-4 text-muted-foreground">
          No milestones yet. Add the milestones you plan to deliver — delivery rate and milestone
          health are calculated from them.
        </p>
      ) : (
        <ul className="divide-y" aria-label="Milestones by planned date">
          {rows.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
              <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
                <p className="font-medium break-words">{m.title}</p>
                <p className="text-caption text-muted-foreground tabular">
                  Planned {formatDate(m.dueDate) ?? "— (no date)"}
                  {m.completedAt && ` · Completed ${formatDate(m.completedAt)}`}
                </p>
              </div>
              <MilestoneStatusBadge m={m} />
              <div className="flex flex-wrap gap-1">
                {m.status === "completed" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Reopen ${m.title}`}
                    onClick={() => update.mutate({ id: m.id, status: "in_progress" })}
                  >
                    <RotateCcw aria-hidden />
                    Reopen
                  </Button>
                ) : m.status !== "cancelled" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Mark ${m.title} complete`}
                    onClick={() => update.mutate({ id: m.id, status: "completed" })}
                  >
                    <CheckCircle2 aria-hidden />
                    Complete
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${m.title}`}
                  onClick={() => setEditing(m)}
                >
                  <Pencil aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${m.title}`}
                  onClick={() => setDeleting(m)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {update.isError && (
        <p role="alert" className="border-t px-4 py-2 text-danger">
          The milestone could not be updated. {update.error.message}
        </p>
      )}
      {info && info.totalPages > 1 && (
        <nav
          aria-label="Milestone pages"
          className="flex items-center justify-end gap-1 border-t px-4 py-2"
        >
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft aria-hidden />
            Previous
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
            Next
            <ChevronRight aria-hidden />
          </Button>
        </nav>
      )}
      <EntityFormDialog
        open={creating}
        onOpenChange={setCreating}
        title="New milestone"
        fields={MILESTONE_FIELDS}
        submitLabel="Create milestone"
        onSubmit={(payload) => create.mutateAsync(payload)}
      />
      <EntityFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit milestone"
        fields={MILESTONE_FIELDS}
        initial={editing ?? undefined}
        submitLabel="Save changes"
        onSubmit={(payload) => update.mutateAsync({ ...payload, id: editing!.id })}
      />
      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete milestone “${deleting?.title ?? ""}”?`}
        description="The milestone is permanently deleted. The deletion is recorded in the audit log. To keep it but exclude it from delivery rate, set its status to Cancelled instead."
        onConfirm={async () => {
          await remove.mutateAsync({ id: deleting!.id });
        }}
      />
    </section>
  );
}

/** Milestones across all projects — the drill-down source list for milestone metrics. */
export function MilestonesList() {
  return (
    <ResourceList<MilestoneDto>
      resource="milestones"
      path="/api/v1/milestones"
      singular="milestone"
      plural="milestones"
      related={["projects"]}
      canCreate={false}
      rowLabel={(m) => m.title}
      extraParams={[
        { name: "projectId", label: "Project" },
        { name: "open", label: "Open", format: (v) => (v === "true" ? "yes" : "no") },
        {
          name: "dated",
          label: "Has a planned date",
          format: (v) => (v === "true" ? "yes" : "no"),
        },
        { name: "dueFrom", label: "Planned from" },
        { name: "dueTo", label: "Planned to" },
        { name: "completedFrom", label: "Completed from" },
        { name: "completedTo", label: "Completed to" },
      ]}
      searchPlaceholder="Milestone title…"
      filters={[
        { name: "status", label: "Status", options: MILESTONE_STATUS_OPTIONS },
        { name: "overdue", label: "Overdue", options: YES_NO_OPTIONS },
      ]}
      sortOptions={[
        { value: "dueDate", label: "Planned date" },
        { value: "-completedAt", label: "Recently completed" },
        { value: "title", label: "Title A–Z" },
        { value: "-updatedAt", label: "Recently updated" },
      ]}
      defaultSort="dueDate"
      fields={MILESTONE_FIELDS}
      empty={{
        title: "No milestones yet.",
        body: "Milestones are added inside a project (Projects → a project → Delivery).",
      }}
      columns={[
        { header: "Milestone", cell: (m) => m.title },
        {
          header: "Project",
          cell: (m) => (
            <Link
              href={`/projects/${m.project.id}#milestones` as never}
              className="hover:underline"
            >
              {m.project.name}
            </Link>
          ),
        },
        { header: "Status", cell: (m) => <MilestoneStatusBadge m={m} /> },
        { header: "Planned", cell: (m) => formatDate(m.dueDate) ?? "—", className: "tabular" },
        {
          header: "Completed",
          cell: (m) => formatDate(m.completedAt) ?? "—",
          className: "tabular",
        },
      ]}
    />
  );
}
