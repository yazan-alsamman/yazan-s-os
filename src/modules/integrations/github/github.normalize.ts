import { provenanceOf, type Provenance } from "../provenance";

import type {
  GitHubRawCommit,
  GitHubRawContributor,
  GitHubRawEvent,
  GitHubRawIssue,
  GitHubRawPullRequest,
  GitHubRawRelease,
  GitHubRawRepo,
} from "./github.client";

/**
 * Normalize untrusted GitHub payloads into bounded PEOS DTOs with provenance (Phase 9.5). Pure and
 * unit-tested. External ids are provider-native (repo id, commit SHA, event id) — never fabricated.
 * GitHub's own timestamps are kept distinct from PEOS's observation time.
 */
const PROVIDER = "github" as const;

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
  openIssues: number;
  createdDate: string | null;
  updatedDate: string | null;
  pushedDate: string | null;
  archived: boolean;
  fork: boolean;
  url: string;
  provenance: Provenance;
}

export interface CommitDto {
  sha: string;
  message: string;
  author: { name: string | null; email: string | null; login: string | null };
  committer: { name: string | null; email: string | null; login: string | null };
  authoredDate: string | null;
  committedDate: string | null;
  additions: number | null;
  deletions: number | null;
  totalChanges: number | null;
  url: string;
  provenance: Provenance;
}

export interface ActivityDto {
  externalId: string;
  type: string;
  actor: string | null;
  createdDate: string | null;
  url: string | null;
  provenance: Provenance;
}

export interface PullRequestDto {
  externalId: string;
  number: number;
  title: string | null;
  authorLogin: string | null;
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
  baseBranch: string | null;
  headBranch: string | null;
  comments: number | null;
  createdDate: string | null;
  updatedDate: string | null;
  closedDate: string | null;
  mergedDate: string | null;
  url: string;
  provenance: Provenance;
}

export interface IssueDto {
  externalId: string;
  number: number;
  title: string | null;
  authorLogin: string | null;
  state: "open" | "closed";
  comments: number | null;
  labels: string[];
  assignees: string[];
  milestone: string | null;
  isPullRequest: boolean;
  createdDate: string | null;
  updatedDate: string | null;
  closedDate: string | null;
  url: string;
  provenance: Provenance;
}

export interface ReleaseDto {
  externalId: string;
  tagName: string | null;
  name: string | null;
  authorLogin: string | null;
  draft: boolean;
  prerelease: boolean;
  createdDate: string | null;
  publishedDate: string | null;
  url: string;
  provenance: Provenance;
}

export interface ContributorDto {
  login: string;
  contributions: number;
  avatarUrl: string | null;
  url: string | null;
  provenance: Provenance;
}

export function normalizeRepo(raw: GitHubRawRepo, now: Date): RepoDto {
  const externalId = String(raw.id);
  return {
    externalId,
    name: raw.name,
    fullName: raw.full_name,
    description: raw.description ?? null,
    visibility: raw.private ? "private" : "public",
    owner: raw.owner?.login ?? null,
    defaultBranch: raw.default_branch ?? null,
    language: raw.language ?? null,
    topics: Array.isArray(raw.topics) ? raw.topics : [],
    stars: raw.stargazers_count ?? 0,
    forks: raw.forks_count ?? 0,
    watchers: raw.watchers_count ?? 0,
    openIssues: raw.open_issues_count ?? 0,
    createdDate: raw.created_at ?? null,
    updatedDate: raw.updated_at ?? null,
    pushedDate: raw.pushed_at ?? null,
    archived: Boolean(raw.archived),
    fork: Boolean(raw.fork),
    url: raw.html_url,
    provenance: provenanceOf({
      provider: PROVIDER,
      resourceType: "repository",
      externalId,
      sourceUrl: raw.html_url,
      observedAt: now,
      lastSyncedAt: now,
    }),
  };
}

export function normalizeCommit(fullName: string, raw: GitHubRawCommit, now: Date): CommitDto {
  return {
    sha: raw.sha,
    message: raw.commit?.message ?? "",
    author: {
      name: raw.commit?.author?.name ?? null,
      email: raw.commit?.author?.email ?? null,
      login: raw.author?.login ?? null,
    },
    committer: {
      name: raw.commit?.committer?.name ?? null,
      email: raw.commit?.committer?.email ?? null,
      login: raw.committer?.login ?? null,
    },
    authoredDate: raw.commit?.author?.date ?? null,
    committedDate: raw.commit?.committer?.date ?? null,
    additions: raw.stats?.additions ?? null,
    deletions: raw.stats?.deletions ?? null,
    totalChanges: raw.stats?.total ?? null,
    url: raw.html_url,
    provenance: provenanceOf({
      provider: PROVIDER,
      resourceType: "commit",
      externalId: `${fullName}@${raw.sha}`,
      sourceUrl: raw.html_url,
      observedAt: now,
      lastSyncedAt: now,
    }),
  };
}

const normState = (raw: string | null): "open" | "closed" => (raw === "closed" ? "closed" : "open");

export function normalizePullRequest(
  fullName: string,
  raw: GitHubRawPullRequest,
  now: Date,
): PullRequestDto {
  const externalId = String(raw.id);
  return {
    externalId,
    number: raw.number,
    title: raw.title ?? null,
    authorLogin: raw.user?.login ?? null,
    state: normState(raw.state),
    draft: Boolean(raw.draft),
    merged: Boolean(raw.merged_at),
    baseBranch: raw.base?.ref ?? null,
    headBranch: raw.head?.ref ?? null,
    comments: typeof raw.comments === "number" ? raw.comments : null,
    createdDate: raw.created_at ?? null,
    updatedDate: raw.updated_at ?? null,
    closedDate: raw.closed_at ?? null,
    mergedDate: raw.merged_at ?? null,
    url: raw.html_url,
    provenance: provenanceOf({
      provider: PROVIDER,
      resourceType: "pull_request",
      externalId: `${fullName}#${raw.number}`,
      sourceUrl: raw.html_url,
      observedAt: now,
      lastSyncedAt: now,
    }),
  };
}

export function normalizeIssue(fullName: string, raw: GitHubRawIssue, now: Date): IssueDto {
  const externalId = String(raw.id);
  const labels = Array.isArray(raw.labels)
    ? raw.labels
        .map((l) => (typeof l === "string" ? l : (l?.name ?? null)))
        .filter((l): l is string => Boolean(l))
    : [];
  const assignees = Array.isArray(raw.assignees)
    ? raw.assignees.map((a) => a?.login ?? null).filter((a): a is string => Boolean(a))
    : [];
  return {
    externalId,
    number: raw.number,
    title: raw.title ?? null,
    authorLogin: raw.user?.login ?? null,
    state: normState(raw.state),
    comments: typeof raw.comments === "number" ? raw.comments : null,
    labels,
    assignees,
    milestone: raw.milestone?.title ?? null,
    isPullRequest: raw.pull_request !== undefined && raw.pull_request !== null,
    createdDate: raw.created_at ?? null,
    updatedDate: raw.updated_at ?? null,
    closedDate: raw.closed_at ?? null,
    url: raw.html_url,
    provenance: provenanceOf({
      provider: PROVIDER,
      resourceType: "issue",
      externalId: `${fullName}#${raw.number}`,
      sourceUrl: raw.html_url,
      observedAt: now,
      lastSyncedAt: now,
    }),
  };
}

export function normalizeRelease(fullName: string, raw: GitHubRawRelease, now: Date): ReleaseDto {
  const externalId = String(raw.id);
  return {
    externalId,
    tagName: raw.tag_name ?? null,
    name: raw.name ?? null,
    authorLogin: raw.author?.login ?? null,
    draft: Boolean(raw.draft),
    prerelease: Boolean(raw.prerelease),
    createdDate: raw.created_at ?? null,
    publishedDate: raw.published_at ?? null,
    url: raw.html_url,
    provenance: provenanceOf({
      provider: PROVIDER,
      resourceType: "release",
      externalId: `${fullName}@${externalId}`,
      sourceUrl: raw.html_url,
      observedAt: now,
      lastSyncedAt: now,
    }),
  };
}

export function normalizeContributor(
  fullName: string,
  raw: GitHubRawContributor,
  now: Date,
): ContributorDto | null {
  if (!raw.login) return null;
  return {
    login: raw.login,
    contributions: typeof raw.contributions === "number" ? raw.contributions : 0,
    avatarUrl: raw.avatar_url ?? null,
    url: raw.html_url ?? null,
    provenance: provenanceOf({
      provider: PROVIDER,
      resourceType: "contributor",
      externalId: `${fullName}:${raw.login}`,
      sourceUrl: raw.html_url ?? null,
      observedAt: now,
      lastSyncedAt: now,
    }),
  };
}

export function normalizeEvent(fullName: string, raw: GitHubRawEvent, now: Date): ActivityDto {
  return {
    externalId: raw.id,
    type: raw.type ?? "Unknown",
    actor: raw.actor?.login ?? null,
    createdDate: raw.created_at ?? null,
    url: null,
    provenance: provenanceOf({
      provider: PROVIDER,
      resourceType: "activity",
      externalId: `${fullName}#${raw.id}`,
      sourceUrl: null,
      observedAt: now,
      lastSyncedAt: now,
    }),
  };
}
