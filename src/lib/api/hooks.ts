"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchJson, sendJson, withQuery } from "@/lib/http/fetch-json";

/**
 * TanStack Query wrappers over the /api/v1 JSON API. Query keys start with the resource name, so
 * any mutation can invalidate every cached view of the resources it touches.
 */
export interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  page: PageInfo;
}

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

export function useApiList<T>(resource: string, path: string, params: QueryParams = {}) {
  return useQuery({
    queryKey: [resource, "list", path, params],
    queryFn: () => fetchJson<Paginated<T>>(withQuery(path, params)),
    placeholderData: keepPreviousData,
  });
}

export function useApiItem<T>(resource: string, path: string, enabled = true) {
  return useQuery({
    queryKey: [resource, "item", path],
    queryFn: () => fetchJson<{ data: T }>(path).then((r) => r.data),
    enabled,
  });
}

export function useApiGet<T>(key: readonly unknown[], path: string, enabled = true) {
  return useQuery({ queryKey: key, queryFn: () => fetchJson<T>(path), enabled });
}

/**
 * Mutation that invalidates the given resources on success. Relationship changes touch both
 * sides (e.g. linking a skill to a project refreshes "projects" and "skills").
 */
export function useApiMutation<TBody, TResult = unknown>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string | ((body: TBody) => string),
  invalidates: readonly string[],
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) => {
      const url = typeof path === "function" ? path(body) : path;
      return sendJson<TResult>(method, url, method === "DELETE" ? undefined : body);
    },
    onSuccess: async () => {
      await Promise.all(invalidates.map((r) => queryClient.invalidateQueries({ queryKey: [r] })));
    },
  });
}

/** Every Phase 1 resource key — used when an action can affect any of them (imports). */
export const ALL_RESOURCES = [
  "profile",
  "experiences",
  "education",
  "skills",
  "technologies",
  "certifications",
  "projects",
  "evidence",
  "imports",
  "search",
] as const;
