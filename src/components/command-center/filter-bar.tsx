"use client";

import { X } from "lucide-react";
import { useId } from "react";

import { useUrlState } from "@/components/data/use-url-state";
import {
  EVIDENCE_TYPE_OPTIONS,
  ORIGIN_OPTIONS,
  PROJECT_HEALTH_OPTIONS,
  PROJECT_STATUS_OPTIONS,
} from "@/components/records/options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useApiGet } from "@/lib/api/hooks";

import { FILTER_KEYS } from "./use-dashboard";

const RANGE_OPTIONS = [
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "365d", label: "Last 365 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
];

function Select({
  label,
  name,
  options,
  allLabel = "All",
  value,
  onChange,
}: {
  label: string;
  name: string;
  options: readonly { value: string; label: string }[];
  allLabel?: string | null;
  value: string;
  onChange: (name: string, value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-w-36 flex-1 flex-col gap-1 sm:flex-none">
      <label htmlFor={id} className="text-caption text-muted-foreground">
        {label}
      </label>
      <NativeSelect id={id} value={value} onChange={(e) => onChange(name, e.target.value)}>
        {allLabel !== null && <option value="">{allLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

/**
 * Command Center filters. State lives in the URL (shareable, bookmarkable, back-button safe).
 * Each control states which widgets it affects via the section headings that show "Filtered".
 */
export function FilterBar() {
  const { get, set } = useUrlState();
  const fromId = useId();
  const toId = useId();
  const categories = useApiGet<{ data: { categories: string[] } }>(
    ["skills", "categories"],
    "/api/v1/skills/categories",
  );
  const range = get("range") || "90d";
  const change = (name: string, value: string) => set({ [name]: value || null });
  const anyActive = FILTER_KEYS.some((key) => key !== "range" && get(key)) || range !== "90d";

  return (
    <section aria-label="Command Center filters" className="mb-5 rounded-lg border bg-surface p-3">
      <div className="flex flex-wrap items-end gap-2">
        <Select
          label="Date range"
          name="range"
          options={RANGE_OPTIONS}
          allLabel={null}
          value={range}
          onChange={(name, value) =>
            set(
              value === "custom"
                ? { range: value }
                : { range: value === "90d" ? null : value, from: null, to: null },
            )
          }
        />
        {range === "custom" && (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor={fromId} className="text-caption text-muted-foreground">
                From
              </label>
              <Input
                id={fromId}
                type="date"
                value={get("from")}
                onChange={(e) => change("from", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={toId} className="text-caption text-muted-foreground">
                To
              </label>
              <Input
                id={toId}
                type="date"
                value={get("to")}
                onChange={(e) => change("to", e.target.value)}
              />
            </div>
          </>
        )}
        <Select
          label="Project status"
          name="projectStatus"
          options={PROJECT_STATUS_OPTIONS}
          value={get("projectStatus")}
          onChange={change}
        />
        <Select
          label="Project health"
          name="projectHealth"
          options={PROJECT_HEALTH_OPTIONS}
          value={get("projectHealth")}
          onChange={change}
        />
        <Select
          label="Evidence type"
          name="evidenceType"
          options={EVIDENCE_TYPE_OPTIONS}
          value={get("evidenceType")}
          onChange={change}
        />
        <Select
          label="Evidence verification"
          name="evidenceVerified"
          options={[
            { value: "true", label: "Verified" },
            { value: "false", label: "Unverified" },
          ]}
          value={get("evidenceVerified")}
          onChange={change}
        />
        <Select
          label="Evidence provenance"
          name="evidenceOrigin"
          options={ORIGIN_OPTIONS}
          value={get("evidenceOrigin")}
          onChange={change}
        />
        <Select
          label="Skill category"
          name="skillCategory"
          options={(categories.data?.data.categories ?? []).map((c) => ({ value: c, label: c }))}
          value={get("skillCategory")}
          onChange={change}
        />
        {anyActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => set(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))}
          >
            <X aria-hidden />
            Clear filters
          </Button>
        )}
      </div>
      {range === "custom" && (!get("from") || !get("to")) && (
        <p className="mt-2 text-caption text-muted-foreground" role="status">
          Choose both dates to apply the custom range.
        </p>
      )}
    </section>
  );
}
