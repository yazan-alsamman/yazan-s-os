import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDb } from "@/lib/db/client";
import { createGitHubInsightsService } from "@/modules/integrations/github/github-insights.service";
import { createGitHubSyncService } from "@/modules/integrations/github/github-sync.service";
import { createIntegrationService } from "@/modules/integrations/integration.service";
import type { ServiceContext } from "@/modules/shared/service-context";

import { contextFor, createTestUser, truncateAll } from "./database";

/**
 * Phase 9.7 GitHub Intelligence Expansion: pull requests, issues (PRs excluded), releases,
 * contributors, unified activity timeline, commit distributions, personal activity, cross-repo
 * comparison, synchronization status/partial semantics and owner isolation — all against a mocked
 * GitHub API with injectable time.
 */
const db = getDb();
const DAY = 86_400_000;
const NOW = new Date("2026-06-15T12:00:00.000Z");
const ago = (d: number, hour = 12) =>
  new Date(NOW.getTime() - d * DAY).toISOString().replace(/T\d\d/, `T${String(hour).padStart(2, "0")}`);
const json = (b: unknown) =>
  new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });

const REPOS = [
  {
    id: 1,
    name: "alpha",
    full_name: "octo/alpha",
    private: false,
    owner: { login: "octo", type: "User" },
    default_branch: "main",
    language: "TypeScript",
    html_url: "https://github.com/octo/alpha",
    description: "a",
    topics: [],
    stargazers_count: 5,
    forks_count: 0,
    watchers_count: 0,
    open_issues_count: 1,
    created_at: ago(400),
    updated_at: ago(5),
    pushed_at: ago(5),
    archived: false,
    fork: false,
  },
  {
    id: 2,
    name: "beta",
    full_name: "octo/beta",
    private: true,
    owner: { login: "octo", type: "User" },
    default_branch: "main",
    language: "Go",
    html_url: "https://github.com/octo/beta",
    description: "b",
    topics: [],
    stargazers_count: 0,
    forks_count: 0,
    watchers_count: 0,
    open_issues_count: 0,
    created_at: ago(300),
    updated_at: ago(8),
    pushed_at: ago(8),
    archived: false,
    fork: false,
  },
];

const commit = (sha: string, date: string, login = "octo") => ({
  sha,
  html_url: `https://github.com/octo/x/commit/${sha}`,
  commit: {
    message: `c ${sha}`,
    author: { name: login, email: "e", date },
    committer: { name: login, email: "e", date },
  },
  author: { login },
  committer: { login },
});
const COMMITS: Record<string, ReturnType<typeof commit>[]> = {
  "octo/alpha": [commit("a1", ago(5, 9)), commit("a2", ago(20, 14)), commit("a3", ago(15, 9), "mona")],
  "octo/beta": [commit("b1", ago(8, 10))],
};

const pr = (over: Record<string, unknown>) => ({
  id: 1000 + (over.number as number),
  user: { login: "octo" },
  base: { ref: "main" },
  head: { ref: "feature" },
  draft: false,
  comments: 1,
  html_url: `https://github.com/octo/alpha/pull/${over.number}`,
  ...over,
});
const PULLS: Record<string, ReturnType<typeof pr>[]> = {
  "octo/alpha": [
    pr({ number: 1, title: "merged pr", state: "closed", created_at: ago(30), updated_at: ago(18), closed_at: ago(18), merged_at: ago(18) }),
    pr({ number: 2, title: "open pr", state: "open", created_at: ago(12), updated_at: ago(12), closed_at: null, merged_at: null }),
    pr({ number: 3, title: "closed pr", state: "closed", created_at: ago(25), updated_at: ago(20), closed_at: ago(20), merged_at: null }),
  ],
  "octo/beta": [
    pr({ number: 4, title: "beta merged", state: "closed", created_at: ago(22), updated_at: ago(16), closed_at: ago(16), merged_at: ago(16) }),
  ],
};
const ISSUES: Record<string, Record<string, unknown>[]> = {
  "octo/alpha": [
    { id: 50, number: 10, title: "open issue", user: { login: "mona" }, state: "open", comments: 2, labels: [{ name: "bug" }, "docs"], assignees: [{ login: "octo" }], milestone: { title: "v1" }, created_at: ago(10), updated_at: ago(10), closed_at: null, html_url: "https://github.com/octo/alpha/issues/10" },
    { id: 51, number: 11, title: "closed issue", user: { login: "octo" }, state: "closed", comments: 0, labels: ["bug"], assignees: [], milestone: null, created_at: ago(20), updated_at: ago(5), closed_at: ago(5), html_url: "https://github.com/octo/alpha/issues/11" },
    // A pull request returned by the issues endpoint — must be excluded from issue analytics.
    { id: 1001, number: 1, title: "merged pr", user: { login: "octo" }, state: "closed", pull_request: { url: "x" }, labels: [], assignees: [], created_at: ago(30), updated_at: ago(18), closed_at: ago(18), html_url: "https://github.com/octo/alpha/pull/1" },
  ],
  "octo/beta": [],
};
const RELEASES: Record<string, Record<string, unknown>[]> = {
  "octo/alpha": [
    { id: 900, tag_name: "v1.0.0", name: "v1", author: { login: "octo" }, draft: false, prerelease: false, created_at: ago(31), published_at: ago(30), html_url: "https://github.com/octo/alpha/releases/v1" },
    { id: 901, tag_name: "v1.1.0-rc", name: "v1.1 rc", author: { login: "octo" }, draft: false, prerelease: true, created_at: ago(11), published_at: ago(10), html_url: "https://github.com/octo/alpha/releases/v1.1" },
  ],
  "octo/beta": [],
};
const CONTRIBUTORS: Record<string, Record<string, unknown>[]> = {
  "octo/alpha": [
    { login: "octo", contributions: 50, html_url: "https://github.com/octo" },
    { login: "mona", contributions: 10, html_url: "https://github.com/mona" },
  ],
  "octo/beta": [{ login: "octo", contributions: 5, html_url: "https://github.com/octo" }],
};

function makeFetch(extra: Partial<{ rateLimitPulls: boolean; extraPullAlpha: ReturnType<typeof pr> }> = {}) {
  return (async (input: string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("login/oauth/access_token")) return json({ access_token: "gho_x", scope: "repo" });
    if (url.endsWith("/user")) return json({ id: 7, login: "octo", name: "Octo", email: "o@e", html_url: "u" });
    if (url.includes("/user/repos")) {
      const page = Number(new URL(url).searchParams.get("page") ?? "1");
      return json(page === 1 ? REPOS : []);
    }
    const page = Number(new URL(url).searchParams.get("page") ?? "1");
    const m = url.match(/\/repos\/(octo\/\w+)\/(commits|pulls|issues|releases|contributors)/);
    if (m) {
      const [, repo, kind] = m;
      if (kind === "pulls" && extra.rateLimitPulls) {
        return new Response("rate limited", { status: 403, headers: { "x-ratelimit-remaining": "0" } });
      }
      if (page > 1) return json([]);
      if (kind === "commits") return json(COMMITS[repo!] ?? []);
      if (kind === "pulls") {
        const base = PULLS[repo!] ?? [];
        return json(repo === "octo/alpha" && extra.extraPullAlpha ? [extra.extraPullAlpha, ...base] : base);
      }
      if (kind === "issues") return json(ISSUES[repo!] ?? []);
      if (kind === "releases") return json(RELEASES[repo!] ?? []);
      if (kind === "contributors") return json(CONTRIBUTORS[repo!] ?? []);
    }
    return new Response("nf", { status: 404 });
  }) as unknown as typeof fetch;
}

const deps = (fetchImpl: typeof fetch) => ({ fetchImpl, now: () => NOW, sleep: async () => {} });
const insights = (fetchImpl: typeof fetch) => createGitHubInsightsService(db, deps(fetchImpl));

async function connect(ctx: ServiceContext, fetchImpl: typeof fetch) {
  const svc = createIntegrationService(db, deps(fetchImpl));
  const { authorizeUrl } = await svc.startConnect(ctx, "github");
  const state = new URL(authorizeUrl).searchParams.get("state")!;
  await svc.handleCallback(ctx, "github", { code: "c", state });
}

describe("Phase 9.7 GitHub Intelligence Expansion (service + database)", () => {
  let alice: ServiceContext;
  let bob: ServiceContext;
  const f = makeFetch();

  beforeAll(async () => {
    await truncateAll();
    alice = contextFor(await createTestUser("gh97-alice"));
    bob = contextFor(await createTestUser("gh97-bob"));
    await connect(alice, f);
    await createGitHubSyncService(db, deps(f)).sync(alice);
  });
  afterAll(truncateAll);

  it("synchronizes all resource types with per-resource status", async () => {
    const status = await insights(f).syncStatus(alice);
    expect(status.completeness).toBe("complete");
    const types = status.resources.map((r) => r.resourceType).sort();
    expect(types).toEqual(
      ["github_commit", "github_contributor", "github_issue", "github_pull_request", "github_release", "repository"].sort(),
    );
    expect(await db.gitHubPullRequest.count({ where: { userId: alice.userId } })).toBe(4);
    expect(await db.gitHubRelease.count({ where: { userId: alice.userId } })).toBe(2);
  });

  it("excludes pull requests from issue analytics (no double counting)", async () => {
    expect(await db.gitHubIssue.count({ where: { userId: alice.userId } })).toBe(2);
    const i = await insights(f).issues(alice, { range: "90d" });
    expect(i.kpis.opened.value).toBe(2);
    expect(i.kpis.closed.value).toBe(1);
    expect(i.kpis.open.value).toBe(1);
    expect(i.kpis.closureRate.value).toBeCloseTo(0.5, 3);
    expect(i.labels.breakdown?.find((b) => b.key === "bug")?.value).toBe(2);
  });

  it("computes transparent pull-request metrics", async () => {
    const p = await insights(f).pullRequests(alice, { range: "90d" });
    expect(p.kpis.opened.value).toBe(4);
    expect(p.kpis.merged.value).toBe(2);
    expect(p.kpis.open.value).toBe(1);
    expect(p.kpis.mergeRate.value).toBeCloseTo(2 / 3, 2); // merged 2 of 3 resolved
    expect(p.byState.breakdown).toEqual([
      { key: "open", label: "Open", value: 1 },
      { key: "merged", label: "Merged", value: 2 },
      { key: "closed", label: "Closed (not merged)", value: 1 },
    ]);
    const merged = await insights(f).pullRequestList(alice, { state: "merged" });
    expect(merged.data.every((pr) => pr.state === "merged")).toBe(true);
    expect(merged.page.total).toBe(2);
  });

  it("reports release intelligence (stable/prerelease, latest, coverage)", async () => {
    const r = await insights(f).releases(alice, { range: "90d" });
    expect(r.kpis.total.value).toBe(2);
    expect(r.stability).toEqual({ stable: 1, prerelease: 1 });
    expect(r.latest?.tagName).toBe("v1.1.0-rc"); // most recently published
    expect(r.coverage).toMatchObject({ reposWithReleases: 1, reposTotal: 2, reposWithout: 1 });
  });

  it("distinguishes repository contributors from the authenticated user", async () => {
    const c = await insights(f).contributors(alice, {});
    expect(c.authenticatedLogin).toBe("octo");
    expect(c.total.value).toBe(2); // octo + mona (distinct across repos)
    expect(c.activity.breakdown?.find((b) => b.key === "octo")?.value).toBe(55); // 50 + 5
  });

  it("builds a unified activity timeline with identified event types", async () => {
    const a = await insights(f).activity(alice, { range: "90d" });
    expect(a.total.value).toBeGreaterThan(0);
    const types = new Set(a.events.map((e) => e.type));
    expect(types.has("commit")).toBe(true);
    expect(types.has("pull_request_merged")).toBe(true);
    expect(types.has("issue_opened")).toBe(true);
    expect(types.has("release")).toBe(true);
    const onlyReleases = await insights(f).activity(alice, { range: "90d", type: "release" });
    expect(onlyReleases.events.every((e) => e.type === "release")).toBe(true);
  });

  it("computes commit distributions and heatmap in UTC", async () => {
    const d = await insights(f).commitDistribution(alice, { range: "90d" });
    expect(d.byDayOfWeek.breakdown).toHaveLength(7);
    expect(d.byHour.breakdown).toHaveLength(24);
    expect(d.byHour.breakdown?.reduce((s, b) => s + b.value, 0)).toBe(4); // total commits
    expect(d.heatmap.breakdown?.length).toBeGreaterThan(0);
    expect(d.byAuthor.breakdown?.find((b) => b.key === "octo")?.value).toBe(3);
  });

  it("reports personal GitHub activity for the connected account", async () => {
    const p = await insights(f).personalActivity(alice, { range: "90d" });
    expect(p.available).toBe(true);
    expect(p.login).toBe("octo");
    expect(p.commits?.value).toBe(3); // a1, a2, b1 (a3 is mona's)
    expect(p.pullRequests?.value).toBe(4);
    expect(p.issues?.value).toBe(1); // issue #11 authored by octo (PR excluded)
  });

  it("compares repositories transparently without a combined score", async () => {
    const c = await insights(f).comparison(alice, { range: "all", repoIds: ["1", "2"] });
    const alpha = c.repositories.find((r) => r.externalId === "1")!;
    const beta = c.repositories.find((r) => r.externalId === "2")!;
    expect(alpha.commits).toBe(3);
    expect(beta.commits).toBe(1);
    expect(alpha.releases).toBe(2);
    expect(beta.releases).toBe(0);
    expect(Object.keys(alpha)).not.toContain("score");
  });

  it("is incremental and idempotent — a new PR appears, existing rows are not duplicated", async () => {
    const f2 = makeFetch({
      extraPullAlpha: pr({ number: 5, title: "new pr", state: "open", created_at: ago(2), updated_at: ago(2), closed_at: null, merged_at: null }),
    });
    await createGitHubSyncService(db, deps(f2)).sync(alice);
    expect(await db.gitHubPullRequest.count({ where: { userId: alice.userId } })).toBe(5);
    expect(await db.gitHubCommit.count({ where: { userId: alice.userId } })).toBe(4); // unchanged
  });

  it("surfaces partial synchronization under rate limiting", async () => {
    const carol = contextFor(await createTestUser("gh97-carol"));
    const fr = makeFetch({ rateLimitPulls: true });
    await connect(carol, fr);
    const result = await createGitHubSyncService(db, deps(fr)).sync(carol);
    expect(result.partial).toBe(true);
    expect(result.resources.github_pull_request?.status).toBe("partial");
    const conn = await db.integrationConnection.findFirst({ where: { userId: carol.userId } });
    expect(conn?.status).toBe("degraded");
    const status = await insights(fr).syncStatus(carol);
    expect(status.completeness).toBe("partial");
  });

  it("isolates every new domain by owner", async () => {
    await connect(bob, f);
    await expect(
      insights(f).pullRequests(bob, { range: "90d" }).then((p) => p.kpis.opened.value),
    ).resolves.toBeNull(); // connected, not synced → no_data
    expect(await db.gitHubPullRequest.count({ where: { userId: bob.userId } })).toBe(0);
    expect(await db.gitHubIssue.count({ where: { userId: bob.userId } })).toBe(0);
    expect(await db.gitHubRelease.count({ where: { userId: bob.userId } })).toBe(0);
    expect(await db.gitHubContributor.count({ where: { userId: bob.userId } })).toBe(0);
  });
});
