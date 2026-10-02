"use client";

import { Search } from "lucide-react";
import { useId, useState } from "react";

import type { FieldOption } from "@/components/forms/entity-form";
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
import { useApiList } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/http/fetch-json";

import { ListSkeleton } from "./states";

/**
 * Choose the full set of related records (replace-set semantics, ADR 0015). Candidates come
 * from the caller's own records only (the list API is owner-scoped). Optional per-link
 * attribute (e.g. technology usage type, evidence strength).
 */
export interface PickedItem {
  id: string;
  label: string;
  attribute?: string;
}

interface RelationPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  resource: string;
  path: string;
  /** Text shown for an option row. */
  optionLabel: (row: Record<string, unknown>) => string;
  initial: readonly PickedItem[];
  attribute?: { label: string; options: readonly FieldOption[]; defaultValue: string };
  onSave: (items: PickedItem[]) => Promise<unknown>;
}

export function RelationPicker(props: RelationPickerProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </DialogHeader>
        {props.open && <PickerBody {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function PickerBody({
  resource,
  path,
  optionLabel,
  initial,
  attribute,
  onSave,
  onOpenChange,
}: RelationPickerProps) {
  const searchId = useId();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(() => new Map(initial.map((i) => [i.id, i])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = useApiList<Record<string, unknown> & { id: string }>(resource, path, {
    q: q.trim() || undefined,
    pageSize: 100,
  });

  const toggle = (id: string, label: string) =>
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(id)) next.delete(id);
      else next.set(id, { id, label, attribute: attribute?.defaultValue });
      return next;
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">
          Filter options
        </label>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground"
        />
        <Input
          id={searchId}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter…"
          className="pl-8"
        />
      </div>

      <fieldset className="max-h-72 overflow-y-auto rounded-md border">
        <legend className="sr-only">Available records</legend>
        {options.isPending ? (
          <ListSkeleton rows={3} />
        ) : options.isError ? (
          <p role="alert" className="p-3 text-danger">
            {errorMessage(options.error)}
          </p>
        ) : options.data.data.length === 0 ? (
          <p className="p-3 text-muted-foreground">
            {q ? "No records match." : "You have no records of this type yet. Create one first."}
          </p>
        ) : (
          <ul className="divide-y">
            {options.data.data.map((row) => {
              const label = optionLabel(row);
              const checked = selected.has(row.id);
              return (
                <li key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <label className="flex min-w-0 flex-1 items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--accent-brand)]"
                      checked={checked}
                      onChange={() => toggle(row.id, label)}
                    />
                    <span className="truncate">{label}</span>
                  </label>
                  {attribute && checked && (
                    <NativeSelect
                      aria-label={`${attribute.label} for ${label}`}
                      className="h-8 w-40"
                      value={selected.get(row.id)?.attribute ?? attribute.defaultValue}
                      onChange={(e) =>
                        setSelected((current) =>
                          new Map(current).set(row.id, {
                            id: row.id,
                            label,
                            attribute: e.target.value,
                          }),
                        )
                      }
                    >
                      {attribute.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>
      <p className="text-caption text-muted-foreground" aria-live="polite">
        {selected.size} selected
      </p>
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
              await onSave([...selected.values()]);
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
