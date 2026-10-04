"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchJson, sendJson, withQuery, type ApiError } from "@/lib/http/fetch-json";
import type { MetricResult } from "@/modules/analytics/metric-result";

/** Hooks for GitHub Repository Intelligence (Phase 9.6). One "github-intel" key; sync refreshes all. */
const KEY = "github-intel";
type Params = Record<string, string | number | undefined>;

export interface GhRepo {
  externalId: string;
  name: string;
  fullName: string;
  description: string | null;
  visibility: "public" | "private";
  owner: string | null;
  language: string | null;
  topics: string[];
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  defaultBranch: string | null;
  createdDate: string | null;
  updatedDate: string | null;
  pushedDate: string | null;
  archived: boolean;
  fork: boolean;
  url: string;
  recentCommits: number;
  lastCommitDate: string | null;
}

export interface Overview {
  calculatedAt: string;
  lastSyncedAt: string | null;
  synced: boolean;
  period: { label: string; from: string | null; to: string | null };
  recordCounts: { repositories: number };
  repositories: {
    total: MetricResult;
    active: MetricResult;
    byVisibility: MetricResult;
    byType: MetricResult;
    archived: number;
    fork: number;
    original: number;
  };
  commits: {
    total: MetricResult;
    activeDays: MetricResult;
    activeRepos: number;
    avgPerActiveDay: number | null;
  };
}

export interface Analytics {
  synced: boolean;
  period: { label: string };
  commitTrend: MetricResult & { truncated?: boolean };
  commitsByRepository: MetricResult;
  languageDistribution: MetricResult;
  repositoriesByActivity: MetricResult;
  byVisibility: MetricResult;
  rankings: {
    mostCommits: { key: string; label: string; value: number }[];
    mostRecent: { externalId: string; fullName: string; lastActivity: string }[];
    noRecent: { externalId: string; fullName: string; lastActivity: string }[];
  };
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [KEY] });
}

export function useGithubOverview(range: string) {
  return useQuery({
    queryKey: [KEY, "overview", range],
    queryFn: () =>
      fetchJson<{ data: Overview }>(withQuery("/api/v1/github/overview", { range })).then(
        (r) => r.data,
      ),
    retry: false,
  });
}
export function useGithubAnalytics(range: string) {
  return useQuery({
    queryKey: [KEY, "analytics", range],
    queryFn: () =>
      fetchJson<{ data: Analytics }>(withQuery("/api/v1/github/analytics", { range })).then(
        (r) => r.data,
      ),
    retry: false,
  });
}
export function useGithubRepos(params: Params) {
  return useQuery({
    queryKey: [KEY, "repos", params],
    queryFn: () =>
      fetchJson<{
        data: {
          data: GhRepo[];
          page: { page: number; pageSize: number; total: number; totalPages: number };
          facets: { languages: string[]; owners: string[] };
          lastSyncedAt: string | null;
          synced: boolean;
        };
      }>(withQuery("/api/v1/github/repos", params)).then((r) => r.data),
    retry: false,
  });
}
export function useGithubSync() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => sendJson<{ data: unknown }>("POST", "/api/v1/github/sync", {}),
    onSuccess: invalidate,
  });
}
export function useGithubLanguages(id: string) {
  return useQuery({
    queryKey: [KEY, "languages", id],
    queryFn: () =>
      fetchJson<{ data: { language: string; bytes: number; percent: number }[] }>(
        `/api/v1/github/repositories/${id}/languages`,
      ).then((r) => r.data),
    retry: false,
  });
}

export type { ApiError };
