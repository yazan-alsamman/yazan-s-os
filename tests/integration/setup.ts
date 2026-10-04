import { randomBytes } from "node:crypto";

import { config } from "dotenv";

/**
 * Integration tests run against the isolated `peos_test` database and Redis logical DB 1,
 * never the development database. The environment is fully determined here.
 */
config({ quiet: true });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for integration tests (see .env.example).");
}
if (testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL must differ from DATABASE_URL — refusing to test against dev data.",
  );
}

const redisUrl = new URL(
  process.env.TEST_REDIS_URL ?? process.env.REDIS_URL ?? "redis://127.0.0.1:56379",
);
redisUrl.pathname = "/1";

Object.assign(process.env, {
  NODE_ENV: "test",
  APP_URL: "http://localhost:3100",
  DATABASE_URL: testDatabaseUrl,
  REDIS_URL: redisUrl.toString(),
  BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
  // Integration platform (Phase 9.5): a real encryption key + a configured GitHub connector so the
  // OAuth flow and token encryption are exercised against a mocked provider adapter.
  INTEGRATION_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  GITHUB_INTEGRATION_CLIENT_ID: "test-github-client",
  GITHUB_INTEGRATION_CLIENT_SECRET: "test-github-secret",
  GITHUB_INTEGRATION_REDIRECT_URI: "http://localhost:3100/api/v1/integrations/callback/github",
  AUTH_ALLOW_SIGNUP: "true",
  AUTH_GITHUB_CLIENT_ID: "",
  AUTH_GITHUB_CLIENT_SECRET: "",
  S3_BUCKET: "",
  S3_REGION: "",
  S3_ACCESS_KEY_ID: "",
  S3_SECRET_ACCESS_KEY: "",
  LOG_LEVEL: "fatal",
});
