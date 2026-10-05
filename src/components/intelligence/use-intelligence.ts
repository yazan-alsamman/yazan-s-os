"use client";

import { useApiGet, useApiList, useApiMutation, type QueryParams } from "@/lib/api/hooks";

/** Phase 13 Continuous Intelligence hooks. Signals/candidates are paginated; reviews are singular. */
const INVALIDATES = ["intelligence", "evidence", "search"];

export interface SignalDto {
  id: string;
  type: string;
  severity: "info" | "attention" | "warning" | "critical";
  status: "active" | "reviewed" | "dismissed" | "resolved";
  title: string;
  explanation: string;
  sourceType: string | null;
  sourceId: string | null;
  detectedAt: string;
}
export interface CandidateDto {
  id: string;
  sourceType: string;
  suggestedType: string;
  suggestedTitle: string;
  suggestedDate: string | null;
  sourceUrl: string | null;
  repoFullName: string | null;
  confidence: string;
  status: string;
  github: { resourceType: string | null; resourceId: string | null } | null;
}
export interface WeeklyReviewDto {
  id: string;
  weekStart: string | null;
  weekEnd: string | null;
  status: string;
  coverage: { githubConnected: boolean; githubStale: boolean; reasons: string[] };
  summary: {
    changed: {
      evidenceCreated: { current: number; previous: number; delta: string };
      evidenceAccepted: number;
      commits: { current: number; previous: number; delta: string } | null;
      projectsUpdated: number;
    };
    attention: {
      activeSignals: Record<string, number>;
      newThisWeek: number;
      upcomingDeadlines: { id: string; title: string; deadline: string | null }[];
    };
  };
}
export interface LearningItem {
  priority: "high" | "medium" | "low";
  focus: string;
  why: string;
  evidenceSays: string;
  suggestedAction: string;
  evidenceGoal: string;
  refs: string[];
}

export const useIntelligenceSignals = (params: QueryParams) =>
  useApiList<SignalDto>("intelligence", "/api/v1/intelligence/signals", params);

export const useEvidenceCandidates = (params: QueryParams) =>
  useApiList<CandidateDto>("intelligence", "/api/v1/intelligence/candidates", params);

export const useWeeklyReview = (week?: string) =>
  useApiGet<{ data: WeeklyReviewDto }>(
    ["intelligence", "weekly-review", week ?? "current"],
    `/api/v1/intelligence/weekly-review${week ? `?week=${week}` : ""}`,
  );

export const useLearningPlan = () =>
  useApiGet<{ data: { generatedAt: string; items: LearningItem[] } }>(
    ["intelligence", "learning-plan"],
    "/api/v1/intelligence/learning-plan",
  );

export const useRunIntelligence = () =>
  useApiMutation<Record<string, never>, { data: unknown }>(
    "POST",
    "/api/v1/intelligence/run",
    INVALIDATES,
  );

export const useUpdateSignal = () =>
  useApiMutation<{ id: string; status: "reviewed" | "dismissed" | "active" }>(
    "PATCH",
    (b) => `/api/v1/intelligence/signals/${b.id}`,
    INVALIDATES,
  );

export const useAcceptCandidate = () =>
  useApiMutation<{ id: string }>(
    "POST",
    (b) => `/api/v1/intelligence/candidates/${b.id}/accept`,
    INVALIDATES,
  );

export const useRejectCandidate = () =>
  useApiMutation<{ id: string }>(
    "POST",
    (b) => `/api/v1/intelligence/candidates/${b.id}/reject`,
    INVALIDATES,
  );
