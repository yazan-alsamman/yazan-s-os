import { AppError } from "@/lib/errors/app-error";

/**
 * GitHub REST adapter (Phase 9.5). The only place that talks to GitHub. `fetchImpl` is injectable so
 * the contract is unit-tested without the network. Provider responses are untrusted: callers
 * validate/normalize before the data goes deeper. Errors map to the PEOS integration error codes;
 * rate limits are detected and surfaced (never retried aggressively here).
 */
const BASE = "https://api.github.com";
const UA = "PEOS-Integration/1.0";

export interface GitHubRawRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  owner: { login: string; type: string } | null;
  default_branch: string | null;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count?: number;
  created_at: string | null;
  updated_at: string | null;
  pushed_at: string | null;
  archived: boolean;
  fork: boolean;
  html_url: string;
}

export interface GitHubRawCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name?: string; email?: string; date?: string } | null;
    committer: { name?: string; email?: string; date?: string } | null;
  };
  author: { login?: string } | null;
  committer: { login?: string } | null;
  stats?: { additions?: number; deletions?: number; total?: number };
}

export interface GitHubRawEvent {
  id: string;
  type: string | null;
  actor: { login?: string } | null;
  created_at: string | null;
  repo?: { name?: string };
}

export interface GitHubRawPullRequest {
  id: number;
  number: number;
  title: string | null;
  user: { login?: string } | null;
  state: string | null;
  draft?: boolean;
  created_at: string | null;
  updated_at: string | null;
  closed_at: string | null;
  merged_at: string | null;
  base?: { ref?: string } | null;
  head?: { ref?: string } | null;
  comments?: number;
  html_url: string;
}

export interface GitHubRawIssue {
  id: number;
  number: number;
  title: string | null;
  user: { login?: string } | null;
  state: string | null;
  comments?: number;
  labels?: (string | { name?: string })[];
  assignees?: ({ login?: string } | null)[];
  milestone?: { title?: string } | null;
  /** Present only when GitHub's issue list item is actually a pull request. */
  pull_request?: unknown;
  created_at: string | null;
  updated_at: string | null;
  closed_at: string | null;
  html_url: string;
}

export interface GitHubRawRelease {
  id: number;
  tag_name: string | null;
  name: string | null;
  author: { login?: string } | null;
  draft?: boolean;
  prerelease?: boolean;
  created_at: string | null;
  published_at: string | null;
  html_url: string;
}

export interface GitHubRawContributor {
  login?: string;
  contributions?: number;
  avatar_url?: string;
  html_url?: string;
}

/** Rate-limit snapshot from GitHub response headers (for proactive, graceful pausing). */
export interface RateLimit {
  remaining: number | null;
  resetAt: Date | null;
}

export interface GitHubIdentity {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  html_url: string;
}

export interface GitHubPage<T> {
  items: T[];
  /** From the Link header: whether a next page exists. */
  hasNextPage: boolean;
  /** Rate-limit snapshot after this request (for budget-aware pausing). */
  rateLimit: RateLimit;
}

export function createGitHubClient(token: string, fetchImpl: typeof fetch = fetch) {
  async function request<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<{ data: T; headers: Headers }> {
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params))
      if (v !== undefined) url.searchParams.set(k, String(v));
    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "user-agent": UA,
          "x-github-api-version": "2022-11-28",
        },
      });
    } catch {
      throw new AppError("INTEGRATION_PROVIDER_UNAVAILABLE");
    }
    if (response.status === 401) throw new AppError("INTEGRATION_AUTH_FAILED");
    if (response.status === 404) throw new AppError("EXTERNAL_RESOURCE_NOT_FOUND");
    if (
      response.status === 429 ||
      (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")
    ) {
      throw new AppError("INTEGRATION_RATE_LIMITED");
    }
    if (!response.ok) throw new AppError("INTEGRATION_PROVIDER_UNAVAILABLE");
    let data: T;
    try {
      data = (await response.json()) as T;
    } catch {
      throw new AppError("INTEGRATION_PROVIDER_UNAVAILABLE");
    }
    return { data, headers: response.headers };
  }

  const hasNext = (headers: Headers) => /rel="next"/.test(headers.get("link") ?? "");
  const rateLimitOf = (headers: Headers): RateLimit => {
    const remainingRaw = headers.get("x-ratelimit-remaining");
    const resetRaw = headers.get("x-ratelimit-reset");
    const remaining = remainingRaw !== null && remainingRaw !== "" ? Number(remainingRaw) : null;
    const resetSec = resetRaw !== null && resetRaw !== "" ? Number(resetRaw) : null;
    return {
      remaining: Number.isFinite(remaining) ? remaining : null,
      resetAt: resetSec && Number.isFinite(resetSec) ? new Date(resetSec * 1000) : null,
    };
  };

  return {
    async getAuthenticatedUser(): Promise<GitHubIdentity> {
      return (await request<GitHubIdentity>("/user")).data;
    },
    async listRepositories(opts: {
      page: number;
      perPage: number;
      sort?: "updated" | "pushed" | "full_name" | "created";
      visibility?: "all" | "public" | "private";
      affiliation?: string;
    }): Promise<GitHubPage<GitHubRawRepo>> {
      const { data, headers } = await request<GitHubRawRepo[]>("/user/repos", {
        page: opts.page,
        per_page: opts.perPage,
        sort: opts.sort ?? "updated",
        visibility: opts.visibility ?? "all",
        affiliation: opts.affiliation ?? "owner,collaborator,organization_member",
      });
      return {
        items: Array.isArray(data) ? data : [],
        hasNextPage: hasNext(headers),
        rateLimit: rateLimitOf(headers),
      };
    },
    async getRepository(fullName: string): Promise<GitHubRawRepo> {
      return (await request<GitHubRawRepo>(`/repos/${fullName}`)).data;
    },
    /** GitHub-reported language byte composition for a repository. */
    async listLanguages(fullName: string): Promise<Record<string, number>> {
      return (await request<Record<string, number>>(`/repos/${fullName}/languages`)).data;
    },
    async listCommits(
      fullName: string,
      opts: { page: number; perPage: number; sha?: string; since?: string; until?: string },
    ): Promise<GitHubPage<GitHubRawCommit>> {
      const { data, headers } = await request<GitHubRawCommit[]>(`/repos/${fullName}/commits`, {
        page: opts.page,
        per_page: opts.perPage,
        sha: opts.sha,
        since: opts.since,
        until: opts.until,
      });
      return {
        items: Array.isArray(data) ? data : [],
        hasNextPage: hasNext(headers),
        rateLimit: rateLimitOf(headers),
      };
    },
    async listRepoEvents(
      fullName: string,
      opts: { page: number; perPage: number },
    ): Promise<GitHubPage<GitHubRawEvent>> {
      const { data, headers } = await request<GitHubRawEvent[]>(`/repos/${fullName}/events`, {
        page: opts.page,
        per_page: opts.perPage,
      });
      return {
        items: Array.isArray(data) ? data : [],
        hasNextPage: hasNext(headers),
        rateLimit: rateLimitOf(headers),
      };
    },
    /** Pull requests (any state), newest-updated first for incremental sync. */
    async listPullRequests(
      fullName: string,
      opts: { page: number; perPage: number },
    ): Promise<GitHubPage<GitHubRawPullRequest>> {
      const { data, headers } = await request<GitHubRawPullRequest[]>(`/repos/${fullName}/pulls`, {
        page: opts.page,
        per_page: opts.perPage,
        state: "all",
        sort: "updated",
        direction: "desc",
      });
      return {
        items: Array.isArray(data) ? data : [],
        hasNextPage: hasNext(headers),
        rateLimit: rateLimitOf(headers),
      };
    },
    /** Issues (any state), newest-updated first. GitHub mixes PRs in here; callers must exclude them. */
    async listIssues(
      fullName: string,
      opts: { page: number; perPage: number; since?: string },
    ): Promise<GitHubPage<GitHubRawIssue>> {
      const { data, headers } = await request<GitHubRawIssue[]>(`/repos/${fullName}/issues`, {
        page: opts.page,
        per_page: opts.perPage,
        state: "all",
        sort: "updated",
        direction: "desc",
        since: opts.since,
      });
      return {
        items: Array.isArray(data) ? data : [],
        hasNextPage: hasNext(headers),
        rateLimit: rateLimitOf(headers),
      };
    },
    async listReleases(
      fullName: string,
      opts: { page: number; perPage: number },
    ): Promise<GitHubPage<GitHubRawRelease>> {
      const { data, headers } = await request<GitHubRawRelease[]>(`/repos/${fullName}/releases`, {
        page: opts.page,
        per_page: opts.perPage,
      });
      return {
        items: Array.isArray(data) ? data : [],
        hasNextPage: hasNext(headers),
        rateLimit: rateLimitOf(headers),
      };
    },
    async listContributors(
      fullName: string,
      opts: { page: number; perPage: number },
    ): Promise<GitHubPage<GitHubRawContributor>> {
      const { data, headers } = await request<GitHubRawContributor[]>(
        `/repos/${fullName}/contributors`,
        { page: opts.page, per_page: opts.perPage, anon: "false" },
      );
      return {
        items: Array.isArray(data) ? data : [],
        hasNextPage: hasNext(headers),
        rateLimit: rateLimitOf(headers),
      };
    },
  };
}

export type GitHubClient = ReturnType<typeof createGitHubClient>;
