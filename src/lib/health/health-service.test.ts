import { describe, expect, it, vi } from "vitest";

import { runHealthChecks, type HealthProbe } from "./health-service";

const ok = async () => {};
const fail = async () => {
  throw new Error("down");
};
const now = () => new Date("2026-10-02T00:00:00.000Z");

describe("runHealthChecks", () => {
  it("is healthy when every configured component responds", async () => {
    const report = await runHealthChecks(
      [
        { name: "database", critical: true, check: ok },
        { name: "redis", critical: false, check: ok },
        { name: "storage", critical: false, check: null },
      ],
      { now },
    );
    expect(report).toEqual({
      status: "healthy",
      checks: { database: "healthy", redis: "healthy", storage: "not_configured" },
      timestamp: "2026-10-02T00:00:00.000Z",
    });
  });

  it("is degraded when a non-critical component fails", async () => {
    const onFailure = vi.fn();
    const report = await runHealthChecks(
      [
        { name: "database", critical: true, check: ok },
        { name: "redis", critical: false, check: fail },
      ],
      { onFailure },
    );
    expect(report.status).toBe("degraded");
    expect(report.checks.redis).toBe("unavailable");
    expect(onFailure).toHaveBeenCalledWith("redis", expect.any(Error));
  });

  it("is unavailable when a critical component fails", async () => {
    const report = await runHealthChecks([
      { name: "database", critical: true, check: fail },
      { name: "redis", critical: false, check: ok },
    ]);
    expect(report.status).toBe("unavailable");
  });

  it("treats a hanging probe as unavailable after the timeout", async () => {
    const hang: HealthProbe = {
      name: "redis",
      critical: false,
      check: () => new Promise<void>(() => {}),
    };
    const report = await runHealthChecks([hang], { timeoutMs: 20 });
    expect(report.checks.redis).toBe("unavailable");
  });

  it("never includes error details in the report", async () => {
    const report = await runHealthChecks([
      {
        name: "database",
        critical: true,
        check: async () => {
          throw new Error("password authentication failed for user peos");
        },
      },
    ]);
    expect(JSON.stringify(report)).not.toContain("password");
  });
});
