import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const serverOnlyStub = fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url));

/**
 * Two test projects:
 *  - unit:        pure logic, no infrastructure. Runs everywhere (`pnpm test`).
 *  - integration: real PostgreSQL (TEST_DATABASE_URL) and Redis. Requires `pnpm infra:up`
 *                 (`pnpm test:integration`).
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // `server-only` throws outside React Server Components; tests run on the server anyway.
    alias: { "server-only": serverOnlyStub },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          env: { LOG_LEVEL: "silent" },
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.int.test.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          // Tests share one database; run files sequentially.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
