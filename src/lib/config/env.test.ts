import { describe, expect, it } from "vitest";

import { InvalidEnvironmentError, isStorageConfigured, parseServerEnv } from "./env";

const SECRET = "x".repeat(40);

const valid = {
  NODE_ENV: "development",
  APP_URL: "http://localhost:3100",
  DATABASE_URL: "postgresql://u:p@127.0.0.1:55432/peos",
  REDIS_URL: "redis://127.0.0.1:56379",
  BETTER_AUTH_SECRET: SECRET,
};

function issuesFor(env: Record<string, string | undefined>): string[] {
  try {
    parseServerEnv(env);
  } catch (error) {
    if (error instanceof InvalidEnvironmentError) return error.issues;
    throw error;
  }
  return [];
}

describe("parseServerEnv", () => {
  it("accepts a minimal valid environment and applies safe defaults", () => {
    const env = parseServerEnv(valid);
    expect(env.AUTH_ALLOW_SIGNUP).toBe(false);
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.S3_FORCE_PATH_STYLE).toBe(false);
    expect(isStorageConfigured(env)).toBe(false);
  });

  it.each(["DATABASE_URL", "REDIS_URL", "BETTER_AUTH_SECRET", "APP_URL"])(
    "rejects a missing %s",
    (name) => {
      expect(issuesFor({ ...valid, [name]: undefined }).join("\n")).toContain(name);
    },
  );

  it("rejects a short auth secret without echoing its value", () => {
    const issues = issuesFor({ ...valid, BETTER_AUTH_SECRET: "too-short-secret-value" });
    expect(issues.join("\n")).toContain("BETTER_AUTH_SECRET");
    expect(issues.join("\n")).not.toContain("too-short-secret-value");
  });

  it("rejects a non-postgres database URL", () => {
    expect(issuesFor({ ...valid, DATABASE_URL: "mysql://u:p@h/db" }).join()).toContain(
      "DATABASE_URL",
    );
  });

  it("treats empty optional values as unset", () => {
    const env = parseServerEnv({ ...valid, AUTH_GITHUB_CLIENT_ID: "", S3_ENDPOINT: "" });
    expect(env.AUTH_GITHUB_CLIENT_ID).toBeUndefined();
    expect(env.S3_ENDPOINT).toBeUndefined();
  });

  it("requires GitHub OAuth credentials as a pair", () => {
    expect(issuesFor({ ...valid, AUTH_GITHUB_CLIENT_ID: "id-only" }).join()).toContain(
      "AUTH_GITHUB_CLIENT_ID",
    );
  });

  it("rejects partially configured object storage", () => {
    expect(issuesFor({ ...valid, S3_BUCKET: "peos" }).join()).toContain("partially configured");
  });

  it("recognises fully configured object storage", () => {
    const env = parseServerEnv({
      ...valid,
      S3_BUCKET: "peos",
      S3_REGION: "us-east-1",
      S3_ACCESS_KEY_ID: "key",
      S3_SECRET_ACCESS_KEY: "secret",
    });
    expect(isStorageConfigured(env)).toBe(true);
  });

  it("requires https APP_URL in production for non-local hosts", () => {
    expect(
      issuesFor({ ...valid, NODE_ENV: "production", APP_URL: "http://peos.example.com" }).join(),
    ).toContain("https");
    expect(
      issuesFor({ ...valid, NODE_ENV: "production", APP_URL: "https://peos.example.com" }),
    ).toEqual([]);
  });

  it("allows disabling auth rate limits only on a loopback APP_URL", () => {
    expect(
      parseServerEnv({ ...valid, AUTH_RATE_LIMIT_DISABLED: "true" }).AUTH_RATE_LIMIT_DISABLED,
    ).toBe(true);
    expect(
      issuesFor({
        ...valid,
        APP_URL: "https://peos.example.com",
        AUTH_RATE_LIMIT_DISABLED: "true",
      }).join(),
    ).toContain("AUTH_RATE_LIMIT_DISABLED");
  });

  it("parses boolean flags strictly", () => {
    expect(parseServerEnv({ ...valid, AUTH_ALLOW_SIGNUP: "true" }).AUTH_ALLOW_SIGNUP).toBe(true);
    expect(issuesFor({ ...valid, AUTH_ALLOW_SIGNUP: "yes" }).join()).toContain("AUTH_ALLOW_SIGNUP");
  });
});
