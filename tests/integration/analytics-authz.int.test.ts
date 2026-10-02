import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as activityRoute from "@/app/api/v1/analytics/activity/route";
import * as dashboardRoute from "@/app/api/v1/analytics/dashboard/route";
import * as timelineRoute from "@/app/api/v1/analytics/evidence-timeline/route";
import * as metricsRoute from "@/app/api/v1/analytics/metrics/route";
import * as evidenceRoute from "@/app/api/v1/evidence/route";
import * as projectsRoute from "@/app/api/v1/projects/route";
import { getAuth } from "@/lib/auth/auth";
import { getDb } from "@/lib/db/client";

import { truncateAll } from "./database";

/**
 * Analytics isolation through the real HTTP handlers (prompt §28). Alice has data; Bob has a
 * little of his own. Bob must not be able to infer anything about Alice's records.
 */
type Handler = (
  request: Request,
  segment: { params: Promise<Record<string, string>> },
) => Promise<Response>;
const BASE = "http://localhost:3100";

async function signUp(label: string) {
  const response = await getAuth().api.signUpEmail({
    body: {
      name: `Analytics ${label}`,
      email: `an-${label}-${crypto.randomUUID()}@peos-test.invalid`,
      password: "analytics-test-passphrase",
    },
    asResponse: true,
  });
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0]!;
  const { user } = (await response.json()) as { user: { id: string } };
  return { cookie, userId: user.id };
}

function call(handler: unknown, cookie: string, method: string, path: string, body?: unknown) {
  return (handler as Handler)(
    new Request(`${BASE}${path}`, {
      method,
      headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }),
    { params: Promise.resolve({}) },
  );
}

describe("analytics authorization and user isolation (HTTP)", () => {
  let alice: Awaited<ReturnType<typeof signUp>>;
  let bob: Awaited<ReturnType<typeof signUp>>;

  beforeAll(async () => {
    await truncateAll();
    alice = await signUp("alice");
    bob = await signUp("bob");
    for (const [name, healthStatus] of [
      ["Alice Secret A", "blocked"],
      ["Alice Secret B", "at_risk"],
      ["Alice Secret C", "on_track"],
    ]) {
      await call(projectsRoute.POST, alice.cookie, "POST", "/api/v1/projects", {
        name,
        status: "development",
        healthStatus,
      });
    }
    for (let i = 0; i < 4; i++) {
      await call(evidenceRoute.POST, alice.cookie, "POST", "/api/v1/evidence", {
        type: "document",
        title: `Alice Evidence ${i}`,
        date: new Date().toISOString().slice(0, 10),
        verified: true,
      });
    }
    await call(projectsRoute.POST, bob.cookie, "POST", "/api/v1/projects", {
      name: "Bob Own Project",
      status: "idea",
    });
  });

  afterAll(() => getDb().$disconnect());

  const json = async (r: Response) =>
    (await r.json()) as { data: Record<string, unknown> } & Record<string, unknown>;

  it("every analytics endpoint requires a session", async () => {
    for (const [handler, path] of [
      [dashboardRoute.GET, "/api/v1/analytics/dashboard"],
      [activityRoute.GET, "/api/v1/analytics/activity"],
      [timelineRoute.GET, "/api/v1/analytics/evidence-timeline"],
      [metricsRoute.GET, "/api/v1/analytics/metrics"],
    ] as const) {
      expect((await call(handler, "", "GET", path)).status, path).toBe(401);
    }
  });

  it("KPI values and distributions contain only the caller's records", async () => {
    const bobDashboard = (
      await json(await call(dashboardRoute.GET, bob.cookie, "GET", "/api/v1/analytics/dashboard"))
    ).data as {
      kpis: { key: string; value: number | null }[];
      projects: {
        total: { value: number };
        health: { breakdown: { key: string; value: number }[] };
        attention: unknown[];
      };
      evidence: { total: { value: number | null; state: string } };
    };
    expect(bobDashboard.projects.total.value).toBe(1);
    expect(bobDashboard.projects.health.breakdown.find((b) => b.key === "blocked")?.value).toBe(0);
    expect(bobDashboard.projects.attention).toEqual([]);
    expect(bobDashboard.evidence.total).toMatchObject({ value: null, state: "no_data" });
    expect(JSON.stringify(bobDashboard)).not.toContain("Alice");

    const aliceDashboard = (
      await json(await call(dashboardRoute.GET, alice.cookie, "GET", "/api/v1/analytics/dashboard"))
    ).data as {
      projects: { total: { value: number } };
    };
    expect(aliceDashboard.projects.total.value).toBe(3);
  });

  it("filters cannot widen scope: injected userId/ownerId parameters are ignored", async () => {
    for (const query of [
      `userId=${alice.userId}`,
      `ownerId=${alice.userId}`,
      `user_id=${alice.userId}`,
      `projectHealth=blocked&userId=${alice.userId}`,
      "range=all",
    ]) {
      const r = await call(
        dashboardRoute.GET,
        bob.cookie,
        "GET",
        `/api/v1/analytics/dashboard?${query}`,
      );
      expect(r.status, query).toBe(200);
      const text = JSON.stringify(await r.json());
      expect(text, query).not.toContain("Alice");
      expect(text, query).not.toContain('"value":3');
    }
  });

  it("invalid filters are rejected without leaking data", async () => {
    const r = await call(
      dashboardRoute.GET,
      bob.cookie,
      "GET",
      "/api/v1/analytics/dashboard?projectHealth=__proto__",
    );
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("activity and evidence timeline are user-scoped", async () => {
    const activity = await json(
      await call(
        activityRoute.GET,
        bob.cookie,
        "GET",
        `/api/v1/analytics/activity?range=all&userId=${alice.userId}`,
      ),
    );
    const activityText = JSON.stringify(activity);
    expect(activityText).not.toContain("Alice");
    expect((activity.data as unknown as { label: string }[]).map((a) => a.label)).toEqual([
      "Bob Own Project",
    ]);

    const timeline = await json(
      await call(
        timelineRoute.GET,
        bob.cookie,
        "GET",
        `/api/v1/analytics/evidence-timeline?range=all&userId=${alice.userId}`,
      ),
    );
    expect(timeline.data).toEqual([]);
    expect(timeline.undatedCount).toBe(0);

    const aliceTimeline = await json(
      await call(timelineRoute.GET, alice.cookie, "GET", "/api/v1/analytics/evidence-timeline"),
    );
    expect((aliceTimeline.data as unknown as unknown[]).length).toBe(4);
  });

  it("the metric catalogue is identical for every user (definitions only, no data)", async () => {
    const a = await (
      await call(metricsRoute.GET, alice.cookie, "GET", "/api/v1/analytics/metrics")
    ).text();
    const b = await (
      await call(metricsRoute.GET, bob.cookie, "GET", "/api/v1/analytics/metrics")
    ).text();
    expect(a).toBe(b);
    expect(a).not.toContain("Alice");
  });
});
