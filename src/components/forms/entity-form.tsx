"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useMemo, useState } from "react";
import { useForm, type FieldValues, type Path } from "react-hook-form";
import { z } from "zod";

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
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, errorMessage } from "@/lib/http/fetch-json";
import { cn } from "@/lib/ui/cn";
import { useReturnFocus } from "@/lib/ui/return-focus";

/**
 * Descriptor-driven form used by every Phase 1 create/edit dialog. Client-side checks only
 * improve feedback; the server re-validates everything and its field errors are mapped back
 * onto the inputs (server validation is authoritative).
 */
export type FieldKind = "text" | "textarea" | "url" | "date" | "select" | "checkbox" | "lines";

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDescriptor {
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  maxLength?: number;
  options?: readonly FieldOption[];
  /** For selects: "" option label (omit to force a choice). */
  emptyOption?: string;
  /** Select values that are integers (e.g. skill target level). */
  numeric?: boolean;
  description?: string;
  autoComplete?: string;
  /** Full width in the two-column grid. */
  wide?: boolean;
  /** Send nothing (instead of null) when left empty — e.g. a slug that the server generates. */
  omitIfEmpty?: boolean;
  /** Value used when creating (no existing entity value). */
  defaultValue?: string | boolean;
}

export type FormValues = Record<string, string | boolean>;

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function buildSchema(fields: readonly FieldDescriptor[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) {
    if (field.kind === "checkbox") {
      shape[field.name] = z.boolean();
      continue;
    }
    let schema = z.string();
    if (field.maxLength)
      schema = schema.max(field.maxLength, `At most ${field.maxLength} characters`);
    let refined: z.ZodType<string> = schema;
    if (field.required) refined = schema.trim().min(1, "Required");
    if (field.kind === "url") {
      refined = refined.refine(
        (v) => !v.trim() || isHttpUrl(v.trim()),
        "Enter a full http(s):// URL",
      );
    }
    if (field.kind === "date") {
      refined = refined.refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use YYYY-MM-DD");
    }
    shape[field.name] = refined;
  }
  return z.object(shape);
}

/** Entity → form values (null → "", arrays → one item per line). */
export function toFormValues(
  fields: readonly FieldDescriptor[],
  entity?: Record<string, unknown> | null,
): FormValues {
  const values: FormValues = {};
  for (const field of fields) {
    const raw = entity?.[field.name];
    const value = raw === undefined ? field.defaultValue : raw;
    if (field.kind === "checkbox") values[field.name] = Boolean(value);
    else if (field.kind === "lines")
      values[field.name] = Array.isArray(value) ? value.join("\n") : "";
    else values[field.name] = value === null || value === undefined ? "" : String(value);
  }
  return values;
}

/** Form values → API payload. Empty optional text/date/url → null (clears); empty select → omitted. */
export function toPayload(
  fields: readonly FieldDescriptor[],
  values: FormValues,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.name];
    if (field.kind === "checkbox") {
      payload[field.name] = Boolean(value);
    } else if (field.kind === "lines") {
      payload[field.name] = String(value ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    } else if (field.kind === "select") {
      const text = String(value ?? "");
      if (text === "") {
        if (field.numeric) payload[field.name] = null;
      } else {
        payload[field.name] = field.numeric ? Number(text) : text;
      }
    } else {
      const text = String(value ?? "").trim();
      if (text === "" && field.omitIfEmpty) continue;
      payload[field.name] = text === "" ? (field.required ? "" : null) : text;
    }
  }
  return payload;
}

interface EntityFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: readonly FieldDescriptor[];
  initial?: Record<string, unknown> | null;
  submitLabel: string;
  onSubmit: (payload: Record<string, unknown>) => Promise<unknown>;
}

export function EntityFormDialog(props: EntityFormDialogProps) {
  const returnFocus = useReturnFocus();
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" {...returnFocus}>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>
            {props.description ?? "Fields marked * are required."}
          </DialogDescription>
        </DialogHeader>
        {props.open && (
          <EntityForm
            fields={props.fields}
            initial={props.initial}
            submitLabel={props.submitLabel}
            onSubmit={props.onSubmit}
            onDone={() => props.onOpenChange(false)}
            onCancel={() => props.onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export interface EntityFormProps {
  fields: readonly FieldDescriptor[];
  initial?: Record<string, unknown> | null;
  submitLabel: string;
  onSubmit: (payload: Record<string, unknown>) => Promise<unknown>;
  /** Called after a successful save. */
  onDone?: () => void;
  onCancel?: () => void;
}

/** The form body; used inside EntityFormDialog or inline (e.g. the profile page). */
export function EntityForm({
  fields,
  initial,
  submitLabel,
  onSubmit,
  onDone,
  onCancel,
}: EntityFormProps) {
  const formId = useId();
  const schema = useMemo(() => buildSchema(fields), [fields]);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<FieldValues>({
    resolver: zodResolver(schema as z.ZodType<FieldValues, FieldValues>),
    defaultValues: toFormValues(fields, initial),
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(toPayload(fields, values as FormValues));
      onDone?.();
    } catch (error) {
      const known = new Set(fields.map((f) => f.name));
      const details = error instanceof ApiError ? (error.body?.details ?? []) : [];
      let mapped = false;
      for (const detail of details) {
        const name = detail.path.split(".")[0] ?? "";
        if (known.has(name)) {
          form.setError(
            name as Path<FieldValues>,
            { message: detail.message },
            { shouldFocus: !mapped },
          );
          mapped = true;
        }
      }
      if (!mapped || (error instanceof ApiError && error.body?.code !== "VALIDATION_FAILED")) {
        setFormError(errorMessage(error));
      }
    }
  });

  return (
    <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError && (
        <p
          role="alert"
          className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-body"
        >
          {formError}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => {
          const id = `${formId}-${field.name}`;
          const error = errors[field.name]?.message as string | undefined;
          const describedBy =
            [error ? `${id}-error` : null, field.description ? `${id}-desc` : null]
              .filter(Boolean)
              .join(" ") || undefined;
          const common = {
            id,
            "aria-invalid": error ? true : undefined,
            "aria-describedby": describedBy,
            "aria-required": field.required || undefined,
          };
          const wide = field.wide || field.kind === "textarea" || field.kind === "lines";
          return (
            <div key={field.name} className={cn("flex flex-col gap-1.5", wide && "sm:col-span-2")}>
              {field.kind === "checkbox" ? (
                <label htmlFor={id} className="flex items-center gap-2 text-body">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--accent-brand)]"
                    {...common}
                    {...form.register(field.name)}
                  />
                  {field.label}
                </label>
              ) : (
                <Label htmlFor={id}>
                  {field.label}
                  {field.required && <span aria-hidden> *</span>}
                </Label>
              )}
              {field.kind === "textarea" || field.kind === "lines" ? (
                <Textarea
                  rows={field.kind === "lines" ? 4 : 3}
                  {...common}
                  {...form.register(field.name)}
                />
              ) : field.kind === "select" ? (
                <NativeSelect {...common} {...form.register(field.name)}>
                  {field.emptyOption !== undefined && <option value="">{field.emptyOption}</option>}
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect>
              ) : field.kind !== "checkbox" ? (
                <Input
                  type={field.kind === "date" ? "date" : field.kind === "url" ? "url" : "text"}
                  autoComplete={field.autoComplete ?? "off"}
                  {...common}
                  {...form.register(field.name)}
                />
              ) : null}
              {field.description && (
                <p id={`${id}-desc`} className="text-caption text-muted-foreground">
                  {field.description}
                </p>
              )}
              {error && (
                <p id={`${id}-error`} className="text-caption text-danger">
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <DialogFooter>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
