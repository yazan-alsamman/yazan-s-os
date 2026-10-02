"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";

import { fetchJson, withQuery } from "@/lib/http/fetch-json";
import type { DashboardDto } from "@/modules/analytics/dashboard.service";
import type { MetricDefinition } from "@/modules/analytics/metric-catalogue";

import type { DrillFilters } from "./drilldown";

/** Dashboard filter keys kept in the URL (shareable, bookmarkable — ADR 0020). */
export const FILTER_KEYS = [
  "range",
  "from",
  "to",
  "projectStatus",
  "projectHealth",
  "evidenceType",
  "evidenceVerified",
  "evidenceOrigin",
  "skillCategory",
] as const;

export type FilterKey = (typeof FILTER_KEYS)[number];

export function useDashboardFilters() {
  const searchParams = useSearchParams();
  const values = Object.fromEntries(
    FILTER_KEYS.map((key) => [key, searchParams.get(key) ?? undefined]),
  ) as Partial<Record<FilterKey, string>>;
  const drill: DrillFilters = {
    projectStatus: values.projectStatus,
    projectHealth: values.projectHealth,
    evidenceType: values.evidenceType,
    evidenceVerified: values.evidenceVerified,
    evidenceOrigin: values.evidenceOrigin,
    skillCategory: values.skillCategory,
  };
  return { values, drill };
}

/** Analytics are always fetched fresh on mount (staleTime 0): numbers must reflect the database. */
export function useDashboard(values: Partial<Record<FilterKey, string>>) {
  return useQuery({
    queryKey: ["analytics", "dashboard", values],
    queryFn: () =>
      fetchJson<{ data: DashboardDto }>(withQuery("/api/v1/analytics/dashboard", values)).then(
        (r) => r.data,
      ),
    staleTime: 0,
    placeholderData: keepPreviousData,
    // An incomplete custom range is not sent (it would be a validation error); the last result stays.
    enabled: !(values.range === "custom" && (!values.from || !values.to)),
  });
}

export function useMetricCatalogue() {
  return useQuery({
    queryKey: ["analytics", "metrics"],
    queryFn: () =>
      fetchJson<{ data: MetricDefinition[] }>("/api/v1/analytics/metrics").then((r) => r.data),
    staleTime: Infinity,
  });
}
