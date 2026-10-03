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
      return { items: Array.isArray(data) ? data : [], hasNextPage: hasNext(headers) };
    },
    async getRepository(fullName: string): Promise<GitHubRawRepo> {
      return (await request<GitHubRawRepo>(`/repos/${fullName}`)).data;
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
      return { items: Array.isArray(data) ? data : [], hasNextPage: hasNext(headers) };
    },
    async listRepoEvents(
      fullName: string,
      opts: { page: number; perPage: number },
    ): Promise<GitHubPage<GitHubRawEvent>> {
      const { data, headers } = await request<GitHubRawEvent[]>(`/repos/${fullName}/events`, {
        page: opts.page,
        per_page: opts.perPage,
      });
      return { items: Array.isArray(data) ? data : [], hasNextPage: hasNext(headers) };
    },
  };
}

export type GitHubClient = ReturnType<typeof createGitHubClient>;
