import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

/**
 * E2E smoke tests run the production build (`pnpm build` first) against the isolated
 * `peos_test` database. Sign-up is enabled only for this server process.
 */
loadEnv({ quiet: true });

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required for E2E tests.");

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm start",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: testDatabaseUrl,
      APP_URL: baseURL,
      AUTH_ALLOW_SIGNUP: "true",
      // Many accounts sign up/in from 127.0.0.1 within a minute; allowed only on loopback (env.ts).
      AUTH_RATE_LIMIT_DISABLED: "true",
      LOG_LEVEL: "warn",
    },
  },
});
