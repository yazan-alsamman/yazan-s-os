"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchJson, sendJson, withQuery, type ApiError } from "@/lib/http/fetch-json";
import type { ConnectionDto } from "@/modules/integrations/integration.repository";
import type { ScopeDef } from "@/modules/integrations/providers";

/** Client hooks for the integration platform (Phase 9.5). One "integrations" key; mutations refresh all. */
const KEY = "integrations";

export interface ProviderStatus {
  provider: "github" | "google";
  displayName: string;
  status: "available" | "scaffolded";
  configured: boolean;
  scopes: ScopeDef[];
  resources: string[];
  mutations: string[];
  connection: ConnectionDto | null;
}

export interface RepoDto {
  externalId: string;
  name: string;
  fullName: string;
  description: string | null;
  visibility: "public" | "private";
  owner: string | null;
  defaultBranch: string | null;
  language: string | null;
  topics: string[];
  stars: number;
  forks: number;
  watchers: number;
  createdDate: string | null;
  updatedDate: string | null;
  pushedDate: string | null;
  archived: boolean;
  fork: boolean;
  url: string;
}
export interface RepoPage {
  data: RepoDto[];
  page: { page: number; perPage: number; hasNextPage: boolean };
  fetchedAt: string;
  filteredWithinPage: boolean;
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [KEY] });
}

export function useProviders() {
  return useQuery({
    queryKey: [KEY, "providers"],
    queryFn: () =>
      fetchJson<{ data: ProviderStatus[] }>("/api/v1/integrations/providers").then((r) => r.data),
  });
}

export function useConnect() {
  return useMutation({
    mutationFn: (provider: string) =>
      sendJson<{ data: { authorizeUrl: string } }>(
        "POST",
        `/api/v1/integrations/connect/${provider}`,
        {},
      ).then((r) => r.data),
  });
}

export function useDisconnect() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => sendJson("DELETE", `/api/v1/integrations/${id}`),
    onSuccess: invalidate,
  });
}

export function useSync() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => sendJson("POST", `/api/v1/integrations/${id}/sync`, {}),
    onSuccess: invalidate,
  });
}

export function useRefresh() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => sendJson("POST", `/api/v1/integrations/${id}/refresh`, {}),
    onSuccess: invalidate,
  });
}

export function useRepositories(params: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: [KEY, "github", "repositories", params],
    queryFn: () => fetchJson<{ data: RepoPage }>(withQuery("/api/v1/github/repositories", params)),
    retry: false,
  });
}

export interface RepoDetail {
  repository: RepoDto;
  links: { linkId: string; projectId: string; projectName: string }[];
}
export function useRepository(id: string) {
  return useQuery({
    queryKey: [KEY, "github", "repository", id],
    queryFn: () =>
      fetchJson<{ data: RepoDetail }>(`/api/v1/github/repositories/${id}`).then((r) => r.data),
    retry: false,
  });
}

export function useCommits(id: string, params: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: [KEY, "github", "commits", id, params],
    queryFn: () =>
      fetchJson<{ data: unknown }>(withQuery(`/api/v1/github/repositories/${id}/commits`, params)),
    retry: false,
  });
}

export function useActivity(id: string, params: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: [KEY, "github", "activity", id, params],
    queryFn: () =>
      fetchJson<{ data: unknown }>(withQuery(`/api/v1/github/repositories/${id}/activity`, params)),
    retry: false,
  });
}

export function useLinkRepo(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ projectId, remove }: { projectId: string; remove?: boolean }) =>
      sendJson(remove ? "DELETE" : "POST", `/api/v1/github/repositories/${id}/link`, { projectId }),
    onSuccess: invalidate,
  });
}

export type { ApiError };
