"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { ConfirmDelete } from "@/components/data/confirm-delete";
import { ErrorState, ListSkeleton } from "@/components/data/states";
import { EntityFormDialog, type FieldDescriptor } from "@/components/forms/entity-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApiGet, useApiMutation } from "@/lib/api/hooks";
import { ApiError } from "@/lib/http/fetch-json";
import type { LevelModelDto } from "@/modules/skills/level-model.service";
import type { SkillLevel, SkillLevelModel } from "@/modules/skills/level-models";

const VALUES = [0, 1, 2, 3, 4, 5] as const;

/** Name, then a label and description per canonical level (ADR 0026). */
const FIELDS: readonly FieldDescriptor[] = [
  { name: "name", label: "Model name", kind: "text", required: true, maxLength: 80, wide: true },
  ...VALUES.flatMap((v): FieldDescriptor[] => [
    { name: `label${v}`, label: `Level ${v} name`, kind: "text", required: true, maxLength: 60 },
    { name: `description${v}`, label: `Level ${v} description`, kind: "text", maxLength: 300 },
  ]),
];

function toPayload(values: Record<string, unknown>) {
  return {
    name: values.name,
    levels: VALUES.map((v) => ({
      value: v,
      label: values[`label${v}`],
      description: values[`description${v}`] || null,
    })),
  };
}

function toInitial(model: { name: string; levels: readonly SkillLevel[] }) {
  const initial: Record<string, unknown> = { name: model.name };
  for (const l of model.levels) {
    initial[`label${l.value}`] = l.label;
    initial[`description${l.value}`] = l.description ?? "";
  }
  return initial;
}

function LevelTable({ levels, caption }: { levels: SkillLevel[]; caption: string }) {
  return (
    <table className="w-full text-body">
      <caption className="sr-only">{caption}</caption>
      <thead className="text-caption text-muted-foreground">
        <tr>
          <th scope="col" className="py-1 pr-3 text-left font-medium">
            Value
          </th>
          <th scope="col" className="py-1 pr-3 text-left font-medium">
            Name
          </th>
          <th scope="col" className="py-1 text-left font-medium">
            Description
          </th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {levels.map((l) => (
          <tr key={l.value} className="align-top">
            <th scope="row" className="py-1.5 pr-3 text-left font-normal tabular">
              {l.value}
            </th>
            <td className="py-1.5 pr-3 font-medium">{l.label}</td>
            <td className="py-1.5 text-muted-foreground">{l.description ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function LevelModelsView() {
  const query = useApiGet<{ data: { default: SkillLevelModel; custom: LevelModelDto[] } }>(
    ["skill-level-models"],
    "/api/v1/skill-level-models",
  );
  const invalidates = ["skill-level-models", "skills"];
  const create = useApiMutation<Record<string, unknown>>(
    "POST",
    "/api/v1/skill-level-models",
    invalidates,
  );
  const update = useApiMutation<Record<string, unknown> & { id: string }>(
    "PATCH",
    (b) => `/api/v1/skill-level-models/${b.id}`,
    invalidates,
  );
  const remove = useApiMutation<{ id: string }>(
    "DELETE",
    (b) => `/api/v1/skill-level-models/${b.id}`,
    invalidates,
  );
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LevelModelDto | null>(null);
  const [deleting, setDeleting] = useState<LevelModelDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (query.isPending) return <ListSkeleton rows={4} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const { default: def, custom } = query.data.data;

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-body text-muted-foreground">
        Every model uses the same ordered values 0–5. A custom model renames and describes those
        values for your context; the evidence rules that derive each level (skill-level-v1) do not
        change, so a level always means the same evidence.
      </p>
      <section aria-labelledby="default-model" className="rounded-lg border bg-surface">
        <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <h2 id="default-model" className="text-h3 font-semibold">
            {def.name}
          </h2>
          <Badge>Built in</Badge>
        </header>
        <div className="p-4">
          <LevelTable
            levels={[...def.levels]}
            caption={`${def.name}: levels and the evidence rule for each`}
          />
        </div>
      </section>

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-h2 font-semibold">Your level models</h2>
        <Button onClick={() => setCreating(true)}>
          <Plus aria-hidden />
          New level model
        </Button>
      </div>
      {custom.length === 0 ? (
        <p className="rounded-lg border bg-surface p-4 text-muted-foreground">
          No custom level models. Skills use the default model.
        </p>
      ) : (
        custom.map((m) => (
          <section
            key={m.id}
            aria-labelledby={`model-${m.id}`}
            className="rounded-lg border bg-surface"
          >
            <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
              <h3 id={`model-${m.id}`} className="text-h3 font-semibold">
                {m.name}
              </h3>
              <span className="flex flex-wrap items-center gap-1">
                <Badge>
                  Used by {m.usedBy} skill{m.usedBy === 1 ? "" : "s"}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${m.name}`}
                  onClick={() => setEditing(m)}
                >
                  <Pencil aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${m.name}`}
                  onClick={() => {
                    setDeleteError(null);
                    setDeleting(m);
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
              </span>
            </header>
            <div className="p-4">
              <LevelTable levels={m.levels} caption={`${m.name} levels`} />
            </div>
          </section>
        ))
      )}
      {deleteError && (
        <p role="alert" className="text-danger">
          {deleteError}
        </p>
      )}
      <EntityFormDialog
        open={creating}
        onOpenChange={setCreating}
        title="New level model"
        description="Name each of the six levels (0–5). Fields marked * are required."
        fields={FIELDS}
        initial={toInitial({ ...def, name: "" })}
        submitLabel="Create level model"
        onSubmit={(values) => create.mutateAsync(toPayload(values))}
      />
      <EntityFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Edit level model"
        fields={FIELDS}
        initial={editing ? toInitial(editing) : undefined}
        submitLabel="Save changes"
        onSubmit={(values) => update.mutateAsync({ ...toPayload(values), id: editing!.id })}
      />
      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete level model “${deleting?.name ?? ""}”?`}
        description="Skills that use this model must be moved to another model first. The deletion is recorded in the audit log."
        onConfirm={async () => {
          try {
            await remove.mutateAsync({ id: deleting!.id });
          } catch (error) {
            setDeleteError(
              error instanceof ApiError ? error.message : "The level model could not be deleted.",
            );
          }
        }}
      />
    </div>
  );
}
