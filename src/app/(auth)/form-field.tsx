import type { ComponentProps } from "react";
import type { FieldError } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Labelled input with an accessible, programmatically associated error message. */
export function FormField({
  id,
  label,
  error,
  ...inputProps
}: ComponentProps<typeof Input> & { id: string; label: string; error?: FieldError }) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...inputProps}
      />
      {error && (
        <p id={errorId} className="text-caption text-danger">
          {error.message}
        </p>
      )}
    </div>
  );
}
