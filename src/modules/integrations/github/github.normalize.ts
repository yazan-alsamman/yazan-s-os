import { provenanceOf, type Provenance } from "../provenance";

import type { GitHubRawCommit, GitHubRawEvent, GitHubRawRepo } from "./github.client";

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
