import { randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { decryptWithKey, encryptWithKey } from "./crypto";
import { parseExternalId } from "./external-id";
import type { GitHubRawCommit, GitHubRawEvent, GitHubRawRepo } from "./github/github.client";
import { normalizeCommit, normalizeEvent, normalizeRepo } from "./github/github.normalize";
import { buildAuthorizeUrl, exchangeCodeForToken } from "./oauth";
import { createState, verifyState } from "./oauth-state";
import { externalRef } from "./provenance";
import { getProviderDefinition, PROVIDERS } from "./providers";

describe("token encryption", () => {
  const key = randomBytes(32);
  it("round-trips a secret", () => {
    const blob = encryptWithKey(key, "gho_secrettoken");
    expect(blob).not.toContain("gho_secrettoken");
    expect(decryptWithKey(key, blob)).toBe("gho_secrettoken");
  });
  it("fails to decrypt with the wrong key (authenticated)", () => {
    const blob = encryptWithKey(key, "x");
    expect(() => decryptWithKey(randomBytes(32), blob)).toThrow();
  });
  it("detects tampering", () => {
    const blob = Buffer.from(encryptWithKey(key, "hello"), "base64");
    const last = blob.length - 1;
    blob[last] = (blob[last] ?? 0) ^ 0xff;
    expect(() => decryptWithKey(key, blob.toString("base64"))).toThrow();
  });
});

describe("oauth state (CSRF)", () => {
  const secret = "test-secret";
  it("verifies a well-formed state for the same user and provider", () => {
    const state = createState(secret, { userId: "u1", provider: "github" });
    expect(verifyState(secret, state, { userId: "u1", provider: "github" })).toBe(true);
  });
  it("rejects a state bound to a different user (login CSRF)", () => {
    const state = createState(secret, { userId: "u1", provider: "github" });
    expect(verifyState(secret, state, { userId: "attacker", provider: "github" })).toBe(false);
  });
  it("rejects a different provider, a tampered body and an expired state", () => {
    const state = createState(secret, { userId: "u1", provider: "github" });
    expect(verifyState(secret, state, { userId: "u1", provider: "google" })).toBe(false);
    expect(verifyState(secret, `${state}x`, { userId: "u1", provider: "github" })).toBe(false);
    const old = createState(secret, { userId: "u1", provider: "github" }, Date.now() - 3_600_000);
    expect(verifyState(secret, old, { userId: "u1", provider: "github" })).toBe(false);
  });
  it("rejects a state signed with a different secret", () => {
    const state = createState("other", { userId: "u1", provider: "github" });
    expect(verifyState(secret, state, { userId: "u1", provider: "github" })).toBe(false);
  });
});

describe("connector registry", () => {
  it("defines GitHub as available with least-privilege read scopes", () => {
    const gh = PROVIDERS.github;
    expect(gh.status).toBe("available");
    expect(gh.scopes.map((s) => s.scope)).toEqual(["read:user", "repo"]);
    expect(gh.mutations).toEqual([]);
  });
  it("declares Google as available with Gmail/Drive/Calendar resources", () => {
    expect(PROVIDERS.google.status).toBe("available");
    expect(PROVIDERS.google.resources).toEqual(["gmail", "drive", "calendar"]);
    expect(getProviderDefinition("nope")).toBeNull();
  });
});

describe("oauth helpers", () => {
  it("builds a GitHub authorize URL from the trusted registry", () => {
    const url = new URL(
      buildAuthorizeUrl(
        "github",
        { clientId: "cid", clientSecret: "x", redirectUri: "https://app/cb" },
        "state123",
        ["read:user", "repo"],
      ),
    );
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("state")).toBe("state123");
    expect(url.searchParams.get("scope")).toBe("read:user repo");
  });
  it("exchanges a code for a token (mocked)", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ access_token: "gho_x", scope: "read:user,repo" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const token = await exchangeCodeForToken(
      "github",
      { clientId: "c", clientSecret: "s", redirectUri: "r" },
      "code",
      fetchImpl as unknown as typeof fetch,
    );
    expect(token.accessToken).toBe("gho_x");
    expect(token.scope).toEqual(["read:user", "repo"]);
  });
  it("maps a failed token exchange to an auth error", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 401 }));
    await expect(
      exchangeCodeForToken(
        "github",
        { clientId: "c", clientSecret: "s", redirectUri: "r" },
        "code",
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: "INTEGRATION_AUTH_FAILED" });
  });
});

describe("github normalization + identity", () => {
  const now = new Date("2026-10-04T00:00:00Z");
  it("normalizes a repo with a provider-native external id and provenance", () => {
    const raw = {
      id: 123456,
      name: "peos",
      full_name: "octo/peos",
      description: "d",
      private: true,
      owner: { login: "octo", type: "User" },
      default_branch: "main",
      language: "TypeScript",
      topics: ["x"],
      stargazers_count: 3,
      forks_count: 1,
      watchers_count: 2,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
      pushed_at: "2026-09-02T00:00:00Z",
      archived: false,
      fork: false,
      html_url: "https://github.com/octo/peos",
    } satisfies GitHubRawRepo;
    const dto = normalizeRepo(raw, now);
    expect(dto.externalId).toBe("123456");
    expect(dto.visibility).toBe("private");
    expect(dto.provenance.externalRef).toBe("github:repository:123456");
    expect(dto.provenance.observedAt).toBe(now.toISOString());
  });
  it("keeps authored and committed dates distinct from observed time", () => {
    const raw = {
      sha: "abc",
      html_url: "u",
      commit: {
        message: "m",
        author: { name: "A", email: "a@e", date: "2026-05-01T00:00:00Z" },
        committer: { name: "B", email: "b@e", date: "2026-05-02T00:00:00Z" },
      },
      author: { login: "a" },
      committer: { login: "b" },
    } satisfies GitHubRawCommit;
    const dto = normalizeCommit("octo/peos", raw, now);
    expect(dto.authoredDate).toBe("2026-05-01T00:00:00Z");
    expect(dto.committedDate).toBe("2026-05-02T00:00:00Z");
    expect(dto.provenance.observedAt).toBe(now.toISOString());
  });
  it("normalizes an event", () => {
    const raw = {
      id: "99",
      type: "PushEvent",
      actor: { login: "a" },
      created_at: "2026-05-01T00:00:00Z",
    } satisfies GitHubRawEvent;
    expect(normalizeEvent("octo/peos", raw, now).type).toBe("PushEvent");
  });
});

describe("external id + provenance", () => {
  it("accepts a numeric id and rejects anything else", () => {
    expect(parseExternalId("123")).toBe("123");
    expect(() => parseExternalId("octo/peos")).toThrow();
    expect(() => parseExternalId("12a")).toThrow();
  });
  it("builds a stable external ref", () => {
    expect(externalRef("github", "repository", "42")).toBe("github:repository:42");
  });
});
