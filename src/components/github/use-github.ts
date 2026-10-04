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

// ── Phase 9.7: GitHub Intelligence Expansion ──────────────────────────────────
export interface Paged<T> {
  data: T[];
  page: { page: number; pageSize: number; total: number; totalPages: number };
}
export interface GhPeriod {
  label: string;
  from: string | null;
  to: string | null;
}

export interface PullRequestAnalytics {
  calculatedAt: string;
  synced: boolean;
  period: GhPeriod;
  kpis: {
    opened: MetricResult;
    merged: MetricResult;
    open: MetricResult;
    mergeRate: MetricResult;
    timeToMerge: MetricResult;
  };
  trend: MetricResult;
  byRepository: MetricResult;
  byState: MetricResult;
}
export interface PullRequestRow {
  number: number;
  title: string | null;
  author: string | null;
  repoFullName: string;
  repoExternalId: string;
  state: string;
  draft: boolean;
  createdDate: string | null;
  mergedDate: string | null;
  closedDate: string | null;
  url: string | null;
}

export interface IssueAnalytics {
  calculatedAt: string;
  synced: boolean;
  period: GhPeriod;
  kpis: {
    opened: MetricResult;
    closed: MetricResult;
    open: MetricResult;
    closureRate: MetricResult;
  };
  trend: MetricResult;
  byRepository: MetricResult;
  byState: MetricResult;
  labels: MetricResult;
}
export interface IssueRow {
  number: number;
  title: string | null;
  author: string | null;
  repoFullName: string;
  repoExternalId: string;
  state: string;
  labels: string[];
  comments: number | null;
  createdDate: string | null;
  closedDate: string | null;
  url: string | null;
}

export interface ReleaseAnalytics {
  calculatedAt: string;
  synced: boolean;
  period: GhPeriod;
  kpis: { total: MetricResult };
  stability: { stable: number; prerelease: number };
  coverage: { reposWithReleases: number; reposTotal: number; reposWithout: number };
  latest: {
    tagName: string | null;
    name: string | null;
    repoFullName: string;
    publishedDate: string | null;
    prerelease: boolean;
    url: string | null;
  } | null;
  trend: MetricResult;
  byRepository: MetricResult;
}
export interface ReleaseRow {
  tagName: string | null;
  name: string | null;
  author: string | null;
  repoFullName: string;
  repoExternalId: string;
  draft: boolean;
  prerelease: boolean;
  publishedDate: string | null;
  url: string | null;
}

export interface ContributorAnalytics {
  calculatedAt: string;
  synced: boolean;
  authenticatedLogin: string | null;
  total: MetricResult;
  byRepository: MetricResult;
  activity: MetricResult;
}
export interface ContributorRow {
  login: string;
  contributions: number;
  repoFullName: string;
  repoExternalId: string;
  url: string | null;
}

export interface ActivityEvent {
  type: string;
  repoFullName: string;
  repoExternalId: string;
  timestamp: string | null;
  title: string | null;
  actor: string | null;
  url: string | null;
}
export interface ActivityResponse {
  calculatedAt: string;
  synced: boolean;
  period: GhPeriod;
  total: MetricResult;
  trend: MetricResult;
  byRepository: MetricResult;
  events: ActivityEvent[];
  page: Paged<unknown>["page"];
}

export interface CommitDistribution {
  calculatedAt: string;
  synced: boolean;
  period: GhPeriod;
  byDayOfWeek: MetricResult;
  byHour: MetricResult;
  byAuthor: MetricResult;
  longestGap: MetricResult;
  heatmap: MetricResult;
  heatmapMax: number;
}

export interface PersonalActivity {
  calculatedAt: string;
  synced: boolean;
  available: boolean;
  login: string | null;
  period: GhPeriod;
  commits?: MetricResult;
  pullRequests?: MetricResult;
  issues?: MetricResult;
  repositories?: MetricResult;
  activeDays?: MetricResult;
  commitTrend?: { key: string; label: string; value: number }[];
}

export interface ComparisonRow {
  externalId: string;
  fullName: string;
  commits: number;
  activeDays: number;
  pullRequests: number;
  mergedPullRequests: number;
  issues: number;
  releases: number;
  contributors: number;
  additions: number | null;
  deletions: number | null;
  lastActivity: string | null;
}
export interface ComparisonResponse {
  calculatedAt: string;
  period: GhPeriod;
  repositories: ComparisonRow[];
}

export interface SyncStatusResource {
  resourceType: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  recordsFetched: number;
  recordsUpdated: number;
  recordsFailed: number;
  pendingRepositories: number | null;
  totalRepositories: number | null;
  lastError: string | null;
}
export interface SyncStatus {
  connection: {
    status: string;
    lastSyncAt: string | null;
    lastAttemptedSyncAt: string | null;
    accountLogin: string | null;
  };
  completeness: string;
  resources: SyncStatusResource[];
}

function useGhQuery<T>(name: string, params: Params) {
  return useQuery({
    queryKey: [KEY, name, params],
    queryFn: () =>
      fetchJson<{ data: T }>(withQuery(`/api/v1/github/${name}`, params)).then((r) => r.data),
    retry: false,
  });
}

export const useGithubPullRequests = (p: Params) =>
  useGhQuery<PullRequestAnalytics>("pull-requests", p);
export const useGithubPullRequestList = (p: Params) =>
  useGhQuery<Paged<PullRequestRow>>("pull-requests/list", p);
export const useGithubIssues = (p: Params) => useGhQuery<IssueAnalytics>("issues", p);
export const useGithubIssueList = (p: Params) => useGhQuery<Paged<IssueRow>>("issues/list", p);
export const useGithubReleases = (p: Params) => useGhQuery<ReleaseAnalytics>("releases", p);
export const useGithubReleaseList = (p: Params) =>
  useGhQuery<Paged<ReleaseRow>>("releases/list", p);
export const useGithubContributors = (p: Params) =>
  useGhQuery<ContributorAnalytics>("contributors", p);
export const useGithubContributorList = (p: Params) =>
  useGhQuery<Paged<ContributorRow>>("contributors/list", p);
export const useGithubActivity = (p: Params) => useGhQuery<ActivityResponse>("activity", p);
export const useGithubCommitDistribution = (p: Params) =>
  useGhQuery<CommitDistribution>("commit-distribution", p);
export const useGithubPersonal = (p: Params) => useGhQuery<PersonalActivity>("personal", p);
export const useGithubComparison = (p: Params) => useGhQuery<ComparisonResponse>("comparison", p);
export const useGithubSyncStatus = () => useGhQuery<SyncStatus>("sync/status", {});

export type { ApiError, MetricResult };
