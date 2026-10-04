import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDb } from "@/lib/db/client";
import { createGitHubAnalyticsService } from "@/modules/integrations/github/github-analytics.service";
import { createGitHubSyncService } from "@/modules/integrations/github/github-sync.service";
import { createIntegrationService } from "@/modules/integrations/integration.service";
import type { ServiceContext } from "@/modules/shared/service-context";

import { contextFor, createTestUser, truncateAll } from "./database";

/**
 * Phase 9.6 GitHub Repository Intelligence: sync → store → aggregate against a mocked GitHub API.
 * Covers repository + commit sync (idempotent), overview KPIs + comparison, analytics aggregation,
 * repository filter/sort/paginate, languages, missing-data states and owner isolation.
 */
const db = getDb();
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();
const json = (b: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });

const repo = (over: Record<string, unknown>) => ({
  owner: { login: "octo", type: "User" },
  default_branch: "main",
  topics: [],
  stargazers_count: 0,
  forks_count: 0,
  watchers_count: 0,
  open_issues_count: 0,
  created_at: daysAgo(400),
  updated_at: daysAgo(10),
  pushed_at: daysAgo(10),
  archived: false,
  fork: false,
  description: "d",
  ...over,
});
const REPOS = [
  repo({
    id: 1,
    name: "alpha",
    full_name: "octo/alpha",
    private: false,
    language: "TypeScript",
    html_url: "https://github.com/octo/alpha",
    stargazers_count: 9,
    pushed_at: daysAgo(10),
  }),
  repo({
    id: 2,
    name: "beta",
    full_name: "octo/beta",
    private: true,
    fork: true,
    language: "Python",
    html_url: "https://github.com/octo/beta",
    pushed_at: daysAgo(5),
  }),
];
const commit = (sha: string, date: string) => ({
  sha,
  html_url: `https://github.com/octo/x/commit/${sha}`,
  commit: {
    message: `c ${sha}`,
    author: { name: "Octo", email: "o@e", date },
    committer: { name: "Octo", email: "o@e", date },
  },
  author: { login: "octo" },
  committer: { login: "octo" },
});
const COMMITS: Record<string, ReturnType<typeof commit>[]> = {
  "octo/alpha": [
    commit("a1", daysAgo(10)),
    commit("a2", daysAgo(20)),
    commit("a3", daysAgo(150)),
    commit("a4", daysAgo(200)),
  ],
  "octo/beta": [commit("b1", daysAgo(5))],
};

const githubFetch = (async (input: string | URL) => {
  const url = typeof input === "string" ? input : input.toString();
  if (url.includes("login/oauth/access_token"))
    return json({ access_token: "gho_x", scope: "read:user,repo" });
  if (url.endsWith("/user"))
    return json({ id: 7, login: "octo", name: "Octo", email: "o@e", html_url: "u" });
  if (url.includes("/user/repos")) {
    const page = Number(new URL(url).searchParams.get("page") ?? "1");
    return json(page === 1 ? REPOS : []);
  }
  const commitsMatch = url.match(/\/repos\/(octo\/\w+)\/commits/);
  if (commitsMatch) {
    const page = Number(new URL(url).searchParams.get("page") ?? "1");
    return json(page === 1 ? (COMMITS[commitsMatch[1]!] ?? []) : []);
  }
  if (url.includes("/repos/octo/alpha/languages")) return json({ TypeScript: 1000, CSS: 200 });
  // Phase 9.7 resources: the 9.6 fixtures have none — return empty pages so those syncs succeed at 0.
  if (/\/(pulls|issues|releases|contributors)\b/.test(url)) return json([]);
  const repoMatch = url.match(/\/repos\/(octo\/\w+)$/);
  if (repoMatch)
    return json(REPOS.find((r) => (r as Record<string, unknown>).full_name === repoMatch[1]) ?? {});
  return new Response("nf", { status: 404 });
}) as unknown as typeof fetch;

const deps = { fetchImpl: githubFetch };
const analytics = () => createGitHubAnalyticsService(db, deps);

async function connect(ctx: ServiceContext) {
  const svc = createIntegrationService(db, deps);
  const { authorizeUrl } = await svc.startConnect(ctx, "github");
  const state = new URL(authorizeUrl).searchParams.get("state")!;
  await svc.handleCallback(ctx, "github", { code: "c", state });
}

describe("Phase 9.6 GitHub Repository Intelligence (service + database)", () => {
  let alice: ServiceContext;
  let bob: ServiceContext;
  beforeAll(async () => {
    await truncateAll();
    alice = contextFor(await createTestUser("gh-alice"));
    bob = contextFor(await createTestUser("gh-bob"));
    await connect(alice);
  });
  afterAll(truncateAll);

  it("reports not-synchronized before a sync, then syncs repositories and commits", async () => {
    const before = await analytics().overview(alice, { range: "90d" });
    expect(before.synced).toBe(false);

    const result = await createGitHubSyncService(db, deps).sync(alice);
    expect(result.repositories).toBe(2);
    expect(result.resources.github_commit?.fetched).toBe(5);
    expect(await db.gitHubCommit.count({ where: { userId: alice.userId } })).toBe(5);
  });

  it("is idempotent — re-syncing does not duplicate commits", async () => {
    await createGitHubSyncService(db, deps).sync(alice);
    expect(await db.gitHubCommit.count({ where: { userId: alice.userId } })).toBe(5);
  });

  it("computes overview KPIs with a grounded previous-period comparison", async () => {
    const o = await analytics().overview(alice, { range: "90d" });
    expect(o.synced).toBe(true);
    expect(o.repositories.total.value).toBe(2);
    expect(o.repositories.byVisibility.breakdown).toEqual([
      { key: "public", label: "Public", value: 1 },
      { key: "private", label: "Private", value: 1 },
    ]);
    expect(o.commits.total.value).toBe(3); // a1(10d), a2(20d), b1(5d)
    expect(o.commits.total.comparison).toMatchObject({ state: "available", previousValue: 1 }); // a3(150d)
    expect(o.commits.activeDays.value).toBe(3);
  });

  it("aggregates analytics (trend, by-repo, languages, activity, rankings)", async () => {
    const a = await analytics().analytics(alice, { range: "90d" });
    expect(a.commitsByRepository.breakdown?.find((b) => b.label === "octo/alpha")?.value).toBe(2);
    expect(a.languageDistribution.breakdown?.map((b) => b.key).sort()).toEqual([
      "Python",
      "TypeScript",
    ]);
    expect(a.repositoriesByActivity.breakdown?.find((b) => b.key === "active")?.value).toBe(2);
    expect(a.rankings.mostCommits[0]?.label).toBe("octo/alpha");
  });

  it("lists cached repositories with filters, sort and facets", async () => {
    const all = await analytics().repositories(alice, {});
    expect(all.page.total).toBe(2);
    expect(all.facets.languages).toEqual(["Python", "TypeScript"]);
    const pub = await analytics().repositories(alice, { visibility: "public" });
    expect(pub.data.map((r) => r.fullName)).toEqual(["octo/alpha"]);
    const py = await analytics().repositories(alice, { language: "Python" });
    expect(py.data.map((r) => r.fullName)).toEqual(["octo/beta"]);
    const forks = await analytics().repositories(alice, { type: "fork" });
    expect(forks.data.map((r) => r.fullName)).toEqual(["octo/beta"]);
    const byStars = await analytics().repositories(alice, { sort: "stars" });
    expect(byStars.data[0]!.fullName).toBe("octo/alpha");
  });

  it("returns GitHub-reported language composition for a repository", async () => {
    const langs = await analytics().languages(alice, "1");
    expect(langs[0]).toMatchObject({ language: "TypeScript" });
    expect(langs.reduce((s, l) => s + l.percent, 0)).toBeGreaterThan(99);
  });

  it("isolates data — Bob has no GitHub and cannot see Alice's repositories", async () => {
    await expect(analytics().overview(bob, { range: "90d" })).rejects.toMatchObject({
      code: "INTEGRATION_NOT_CONNECTED",
    });
    await connect(bob);
    const bobOverview = await analytics().overview(bob, { range: "90d" });
    expect(bobOverview.repositories.total.value).toBeNull(); // bob connected but not synced → no_data
    expect(await db.gitHubCommit.count({ where: { userId: bob.userId } })).toBe(0);
  });
});
