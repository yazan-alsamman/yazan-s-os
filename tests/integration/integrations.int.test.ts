import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getServerEnv } from "@/lib/config/env";
import { getDb } from "@/lib/db/client";
import { createGitHubService } from "@/modules/integrations/github/github.service";
import { createIntegrationService } from "@/modules/integrations/integration.service";
import { createState } from "@/modules/integrations/oauth-state";
import type { ServiceContext } from "@/modules/shared/service-context";

import { contextFor, createTestUser, truncateAll } from "./database";

/**
 * Phase 9.5 integration: OAuth connect/callback, token encryption, GitHub repository normalization
 * and caching, project linking, sync state, owner isolation and token security — all against a
 * mocked GitHub adapter (no live provider).
 */
const db = getDb();

function json(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

const REPO = {
  id: 111,
  name: "peos",
  full_name: "octo/peos",
  description: "Engineering OS",
  private: true,
  owner: { login: "octo", type: "User" },
  default_branch: "main",
  language: "TypeScript",
  topics: ["os"],
  stargazers_count: 5,
  forks_count: 1,
  watchers_count: 2,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  pushed_at: "2026-09-02T00:00:00Z",
  archived: false,
  fork: false,
  html_url: "https://github.com/octo/peos",
};

/** A mocked GitHub provider covering the token, identity and REST endpoints the services call. */
const githubFetch = (async (input: string | URL) => {
  const url = typeof input === "string" ? input : input.toString();
  if (url.includes("login/oauth/access_token")) {
    return json({ access_token: "gho_testtoken", scope: "read:user,repo", token_type: "bearer" });
  }
  if (url.endsWith("/user")) {
    return json({
      id: 42,
      login: "octo",
      name: "Octo Cat",
      email: "octo@example.test",
      html_url: "https://github.com/octo",
    });
  }
  if (url.includes("/user/repos")) return json([REPO]);
  if (url.includes("/repos/octo/peos/commits")) {
    return json([
      {
        sha: "abc123",
        html_url: "https://github.com/octo/peos/commit/abc123",
        commit: {
          message: "Initial commit",
          author: { name: "Octo", email: "octo@example.test", date: "2026-05-01T00:00:00Z" },
          committer: { name: "Octo", email: "octo@example.test", date: "2026-05-01T00:00:00Z" },
        },
        author: { login: "octo" },
        committer: { login: "octo" },
      },
    ]);
  }
  if (url.includes("/repos/octo/peos/events")) {
    return json([
      { id: "99", type: "PushEvent", actor: { login: "octo" }, created_at: "2026-05-01T00:00:00Z" },
    ]);
  }
  if (url.includes("/repos/octo/peos")) return json(REPO);
  return new Response("not found", { status: 404 });
}) as unknown as typeof fetch;

const service = () => createIntegrationService(db, { fetchImpl: githubFetch });
const github = () => createGitHubService(db, { fetchImpl: githubFetch });

async function connect(ctx: ServiceContext): Promise<string> {
  const { authorizeUrl } = await service().startConnect(ctx, "github");
  const state = new URL(authorizeUrl).searchParams.get("state")!;
  const { connectionId } = await service().handleCallback(ctx, "github", { code: "code", state });
  return connectionId;
}

describe("Phase 9.5 Integration platform (service + database)", () => {
  let alice: ServiceContext;
  let bob: ServiceContext;

  beforeAll(async () => {
    await truncateAll();
    alice = contextFor(await createTestUser("int-alice"));
    bob = contextFor(await createTestUser("int-bob"));
  });
  afterAll(truncateAll);

  it("connects via OAuth, stores an encrypted token, and never returns it", async () => {
    const connId = await connect(alice);
    const row = await db.integrationConnection.findFirstOrThrow({ where: { id: connId } });
    expect(row.status).toBe("connected");
    expect(row.accountLogin).toBe("octo");
    expect(row.accessTokenEnc).toBeTruthy();
    expect(row.accessTokenEnc).not.toContain("gho_testtoken"); // encrypted at rest

    const dtos = await service().listConnections(alice);
    expect(dtos).toHaveLength(1);
    expect(JSON.stringify(dtos[0])).not.toContain("gho_testtoken");
    expect(dtos[0]).not.toHaveProperty("accessTokenEnc");
    const audit = await db.auditLog.findFirst({
      where: { actorId: alice.userId, action: "integration_connection.connected" },
    });
    expect(audit).not.toBeNull();
  });

  it("rejects an OAuth state bound to a different user (CSRF)", async () => {
    const forged = createState(getServerEnv().BETTER_AUTH_SECRET, {
      userId: bob.userId,
      provider: "github",
    });
    await expect(
      service().handleCallback(alice, "github", { code: "c", state: forged }),
    ).rejects.toMatchObject({ code: "INTEGRATION_AUTH_FAILED" });
  });

  it("lists and normalizes repositories, caching them as external resources", async () => {
    const result = await github().listRepositories(alice, { page: 1, perPage: 30 });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.externalId).toBe("111");
    expect(result.data[0]!.visibility).toBe("private");
    expect(result.data[0]!.provenance.externalRef).toBe("github:repository:111");
    const cached = await db.integrationExternalResource.findFirst({
      where: { userId: alice.userId, externalId: "111" },
    });
    expect(cached?.displayName).toBe("octo/peos");
  });

  it("reads a repository, its commits and activity", async () => {
    const detail = await github().getRepository(alice, "111");
    expect(detail.repository.fullName).toBe("octo/peos");
    const commits = await github().listCommits(alice, "111", { page: 1, perPage: 20 });
    expect(commits.data[0]!.sha).toBe("abc123");
    expect(commits.data[0]!.authoredDate).toBe("2026-05-01T00:00:00Z");
    const activity = await github().listActivity(alice, "111", { page: 1, perPage: 30 });
    expect(activity.data[0]!.type).toBe("PushEvent");
  });

  it("links a repository to a project and unlinks it (owner-scoped, audited)", async () => {
    const project = await db.project.create({
      data: {
        userId: alice.userId,
        name: "OS",
        slug: `os-${crypto.randomUUID()}`,
        status: "production",
      },
    });
    await github().linkProject(alice, "111", project.id);
    const detail = await github().getRepository(alice, "111");
    expect(detail.links.map((l) => l.projectId)).toContain(project.id);
    const linkAudit = await db.auditLog.findFirst({
      where: { actorId: alice.userId, action: "integration_resource_link.linked" },
    });
    expect(linkAudit).not.toBeNull();
    await github().unlinkProject(alice, "111", project.id);
    const after = await github().getRepository(alice, "111");
    expect(after.links).toHaveLength(0);
  });

  it("records sync state on an explicit sync", async () => {
    const summary = await github().sync(alice);
    expect(summary.status).toBe("success");
    const state = await db.integrationSyncState.findFirstOrThrow({
      where: { userId: alice.userId, resourceType: "repository" },
    });
    expect(state.status).toBe("success");
    expect(state.recordsFetched).toBe(1);
  });

  it("isolates connections and blocks a disconnected connection from use", async () => {
    const connId = (await service().listConnections(alice))[0]!.id;
    await expect(service().getConnection(bob, connId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(github().listRepositories(bob, { page: 1, perPage: 30 })).rejects.toMatchObject({
      code: "INTEGRATION_NOT_CONNECTED",
    });

    await service().disconnect(alice, connId);
    const row = await db.integrationConnection.findFirstOrThrow({ where: { id: connId } });
    expect(row.status).toBe("disconnected");
    expect(row.accessTokenEnc).toBeNull(); // token discarded
    await expect(github().listRepositories(alice, { page: 1, perPage: 30 })).rejects.toMatchObject({
      code: "INTEGRATION_NOT_CONNECTED",
    });
  });
});
