"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import { formatDate } from "@/components/data/detail";
import { ErrorState, ListSkeleton } from "@/components/data/states";
import { useUrlState } from "@/components/data/use-url-state";
import {
  labelOf,
  PROJECT_HEALTH_OPTIONS,
  PROJECT_STATUS_OPTIONS,
} from "@/components/records/options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { useApiGet, type PageInfo } from "@/lib/api/hooks";
import { withQuery } from "@/lib/http/fetch-json";

import { BAND_TONE, MANUAL_TONE } from "./dossier";

const COMPUTED_OPTIONS = [
  { value: "good", label: "Good" },
  { value: "watch", label: "Needs watching" },
  { value: "poor", label: "Poor" },
  { value: "insufficient_data", label: "Insufficient data" },
  { value: "not_applicable", label: "Archived (not assessed)" },
];

interface HealthRow {
  id: string;
  name: string;
  status: string;
  manual: string;
  computed: {
    status: string;
    score: number | null;
    band: "good" | "watch" | "poor" | null;
    bucket: string;
    scoredComponents: number;
  };
  milestones: { overdue: number; blocked: number };
}

function Filter({
  label,
  name,
  options,
}: {
  label: string;
  name: string;
  options: readonly { value: string; label: string }[];
}) {
  const id = useId();
  const { get, set } = useUrlState();
  return (
    <div className="flex min-w-40 flex-col gap-1">
      <label htmlFor={id} className="text-caption text-muted-foreground">
        {label}
      </label>
      <NativeSelect
        id={id}
        value={get(name)}
        onChange={(e) => set({ [name]: e.target.value || null, page: null })}
      >
        <option value="">All</option>
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
 * Computed health per project — the source list behind the portfolio's computed-health chart and
 * the manual-vs-computed matrix. Worst score first; projects without a score last.
 */
export function ProjectHealthList() {
  const { get, set } = useUrlState();
  const params = {
    computed: get("computed") || undefined,
    manual: get("manual") || undefined,
    page: get("page") || undefined,
  };
  const query = useApiGet<{ data: HealthRow[]; page: PageInfo; evaluatedOn: string }>(
    ["projects", "health-list", params],
    withQuery("/api/v1/analytics/project-health", params),
  );
  const page = Number(get("page") || 1);

  return (
    <div className="flex flex-col gap-3">
      <section
        aria-label="Computed health filters"
        className="flex flex-wrap items-end gap-2 rounded-lg border bg-surface p-3"
      >
        <Filter label="Computed health" name="computed" options={COMPUTED_OPTIONS} />
        <Filter label="Manual health" name="manual" options={PROJECT_HEALTH_OPTIONS} />
        {(params.computed || params.manual) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => set({ computed: null, manual: null, page: null })}
          >
            Clear filters
          </Button>
        )}
      </section>
      {query.isPending ? (
        <ListSkeleton rows={5} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <p className="rounded-lg border bg-surface p-4 text-muted-foreground">
          {params.computed || params.manual
            ? "No projects match these filters."
            : "No projects yet."}
        </p>
      ) : (
        <div className="rounded-lg border bg-surface">
          <p className="border-b px-4 py-2 text-caption text-muted-foreground">
            {query.data.page.total} projects · evaluated {formatDate(query.data.evaluatedOn)} (UTC)
            · model project-health-v1
          </p>
          <ul className="divide-y" aria-label="Projects by computed health, worst first">
            {query.data.data.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                <Link
                  href={`/projects/${row.id}#health` as never}
                  className="min-w-0 flex-1 font-medium hover:underline"
                >
                  {row.name}
                </Link>
                <span className="text-caption text-muted-foreground">
                  {labelOf(PROJECT_STATUS_OPTIONS, row.status)}
                </span>
                <Badge tone={MANUAL_TONE[row.manual as keyof typeof MANUAL_TONE]}>
                  Manual: {labelOf(PROJECT_HEALTH_OPTIONS, row.manual)}
                </Badge>
                {row.computed.band ? (
                  <Badge tone={BAND_TONE[row.computed.band]}>
                    Computed: {row.computed.score}/100 (
                    {labelOf(COMPUTED_OPTIONS, row.computed.bucket)})
                  </Badge>
                ) : (
                  <Badge>Computed: {labelOf(COMPUTED_OPTIONS, row.computed.bucket)}</Badge>
                )}
                {row.milestones.overdue > 0 && (
                  <Badge tone="danger">{row.milestones.overdue} overdue</Badge>
                )}
                {row.milestones.blocked > 0 && (
                  <Badge tone="warning">{row.milestones.blocked} blocked</Badge>
                )}
              </li>
            ))}
          </ul>
          {query.data.page.totalPages > 1 && (
            <nav
              aria-label="Pages"
              className="flex items-center justify-end gap-1 border-t px-4 py-2"
            >
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => set({ page: String(page - 1) })}
              >
                <ChevronLeft aria-hidden />
                Previous
              </Button>
              <span className="text-caption tabular">
                {page} / {query.data.page.totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= query.data.page.totalPages}
                onClick={() => set({ page: String(page + 1) })}
              >
                Next
                <ChevronRight aria-hidden />
              </Button>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
