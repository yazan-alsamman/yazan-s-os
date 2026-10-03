import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as goalsAnalyticsRoute from "@/app/api/v1/analytics/goals/route";
import * as goalDependencies from "@/app/api/v1/goals/[id]/dependencies/route";
import * as goalIntelligence from "@/app/api/v1/goals/[id]/intelligence/route";
import * as measurementItem from "@/app/api/v1/goals/[id]/measurements/[measurementId]/route";
import * as goalMeasurements from "@/app/api/v1/goals/[id]/measurements/route";
import * as goalMilestones from "@/app/api/v1/goals/[id]/milestones/route";
import * as goalProjects from "@/app/api/v1/goals/[id]/projects/route";
import * as goalItem from "@/app/api/v1/goals/[id]/route";
import * as goalSkills from "@/app/api/v1/goals/[id]/skills/route";
import * as roadmapRoute from "@/app/api/v1/goals/roadmap/route";
import * as goalsRoute from "@/app/api/v1/goals/route";
import * as projectMilestones from "@/app/api/v1/projects/[id]/milestones/route";
import * as projectsRoute from "@/app/api/v1/projects/route";
import * as skillsRoute from "@/app/api/v1/skills/route";
import { getAuth } from "@/lib/auth/auth";
import { getDb } from "@/lib/db/client";

import { truncateAll } from "./database";

/**
 * Phase 5 IDOR / user-isolation matrix through the real HTTP handlers with two real sessions.
 * Alice owns goals linked to her project, skill and milestone. Bob attacks every goal surface.
 */
type Handler = (
  request: Request,
  segment: { params: Promise<Record<string, string>> },
) => Promise<Response>;
const BASE = "http://localhost:3100";

async function signUp(label: string) {
  const response = await getAuth().api.signUpEmail({
    body: {
      name: `P5 ${label}`,
      email: `p5-${label}-${crypto.randomUUID()}@peos-test.invalid`,
      password: "phase5-test-passphrase",
    },
    asResponse: true,
  });
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0]!;
  const { user } = (await response.json()) as { user: { id: string } };
  return { cookie, userId: user.id };
}

function call(
  handler: unknown,
  cookie: string,
  method: string,
  path: string,
  params: Record<string, string> = {},
  body?: unknown,
) {
  return (handler as Handler)(
    new Request(`${BASE}${path}`, {
      method,
      headers: { cookie, origin: BASE, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }),
    { params: Promise.resolve(params) },
  );
}
const idOf = async (r: Response) => ((await r.json()) as { data: { id: string } }).data.id;

describe("Phase 5 authorization and user isolation (HTTP)", () => {
  let alice: Awaited<ReturnType<typeof signUp>>;
  let bob: Awaited<ReturnType<typeof signUp>>;
  const a = {} as Record<
    "project" | "skill" | "milestone" | "star" | "goal" | "measurement",
    string
  >;
  const b = {} as Record<"project" | "goal", string>;

  beforeAll(async () => {
    await truncateAll();
    alice = await signUp("alice");
    bob = await signUp("bob");
    a.project = await idOf(
      await call(
        projectsRoute.POST,
        alice.cookie,
        "POST",
        "/api/v1/projects",
        {},
        { name: "Alice Secret Project" },
      ),
    );
    a.skill = await idOf(
      await call(
        skillsRoute.POST,
        alice.cookie,
        "POST",
        "/api/v1/skills",
        {},
        { name: "Alice Secret Skill" },
      ),
    );
    a.milestone = await idOf(
      await call(
        projectMilestones.POST,
        alice.cookie,
        "POST",
        `/api/v1/projects/${a.project}/milestones`,
        { id: a.project },
        { title: "Alice Secret Milestone" },
      ),
    );
    a.star = await idOf(
      await call(
        goalsRoute.POST,
        alice.cookie,
        "POST",
        "/api/v1/goals",
        {},
        { title: "Alice Secret North Star", type: "north_star" },
      ),
    );
    a.goal = await idOf(
      await call(
        goalsRoute.POST,
        alice.cookie,
        "POST",
        "/api/v1/goals",
        {},
        {
          title: "Alice Secret Goal",
          type: "quarterly_goal",
          parentId: a.star,
          status: "active",
          baseline: 0,
          target: 10,
          deadline: "2027-01-01",
        },
      ),
    );
    for (const [route, path, body] of [
      [goalProjects.PUT, "projects", { projectIds: [a.project] }],
      [goalSkills.PUT, "skills", { skillIds: [a.skill] }],
      [goalMilestones.PUT, "milestones", { milestoneIds: [a.milestone] }],
    ] as const) {
      expect(
        (
          await call(
            route,
            alice.cookie,
            "PUT",
            `/api/v1/goals/${a.goal}/${path}`,
            { id: a.goal },
            body,
          )
        ).status,
      ).toBe(200);
    }
    const m = await call(
      goalMeasurements.POST,
      alice.cookie,
      "POST",
      `/api/v1/goals/${a.goal}/measurements`,
      { id: a.goal },
      { date: "2026-01-01", value: 3 },
    );
    expect(m.status).toBe(201);
    a.measurement = await idOf(m);
    b.project = await idOf(
      await call(
        projectsRoute.POST,
        bob.cookie,
        "POST",
        "/api/v1/projects",
        {},
        { name: "Bob Project" },
      ),
    );
    b.goal = await idOf(
      await call(
        goalsRoute.POST,
        bob.cookie,
        "POST",
        "/api/v1/goals",
        {},
        { title: "Bob Goal", type: "quarterly_goal" },
      ),
    );
  });

  afterAll(() => getDb().$disconnect());

  it("every goal endpoint requires a session", async () => {
    const id = { id: a.goal };
    for (const [handler, method, path, params] of [
      [goalsRoute.GET, "GET", "/api/v1/goals", {}],
      [goalsRoute.POST, "POST", "/api/v1/goals", {}],
      [goalItem.GET, "GET", `/api/v1/goals/${a.goal}`, id],
      [goalIntelligence.GET, "GET", `/api/v1/goals/${a.goal}/intelligence`, id],
      [goalMeasurements.GET, "GET", `/api/v1/goals/${a.goal}/measurements`, id],
      [roadmapRoute.GET, "GET", "/api/v1/goals/roadmap", {}],
      [goalsAnalyticsRoute.GET, "GET", "/api/v1/analytics/goals", {}],
    ] as const) {
      expect(
        (
          await call(
            handler,
            "",
            method,
            path,
            params,
            method === "POST" ? { title: "x", type: "north_star" } : undefined,
          )
        ).status,
        path,
      ).toBe(401);
    }
  });

  it("Bob cannot read, modify or delete Alice's goal, intelligence or measurements", async () => {
    const id = { id: a.goal };
    for (const [handler, path] of [
      [goalItem.GET, `/api/v1/goals/${a.goal}`],
      [goalIntelligence.GET, `/api/v1/goals/${a.goal}/intelligence`],
      [goalMeasurements.GET, `/api/v1/goals/${a.goal}/measurements`],
    ] as const) {
      const r = await call(handler, bob.cookie, "GET", path, id);
      expect(r.status, path).toBe(404);
      expect(await r.text()).not.toContain("Alice");
    }
    expect(
      (
        await call(goalItem.PATCH, bob.cookie, "PATCH", `/api/v1/goals/${a.goal}`, id, {
          title: "pwned",
          status: "cancelled",
        })
      ).status,
    ).toBe(404);
    expect(
      (await call(goalItem.DELETE, bob.cookie, "DELETE", `/api/v1/goals/${a.goal}`, id)).status,
    ).toBe(404);
    expect(
      (
        await call(
          goalMeasurements.POST,
          bob.cookie,
          "POST",
          `/api/v1/goals/${a.goal}/measurements`,
          id,
          { date: "2026-01-02", value: 9 },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call(
          measurementItem.DELETE,
          bob.cookie,
          "DELETE",
          `/api/v1/goals/${a.goal}/measurements/${a.measurement}`,
          { id: a.goal, measurementId: a.measurement },
        )
      ).status,
    ).toBe(404);
    // Bob's own goal id with Alice's measurement id is also not found.
    expect(
      (
        await call(
          measurementItem.DELETE,
          bob.cookie,
          "DELETE",
          `/api/v1/goals/${b.goal}/measurements/${a.measurement}`,
          { id: b.goal, measurementId: a.measurement },
        )
      ).status,
    ).toBe(404);
    const row = await getDb().goal.findUnique({ where: { id: a.goal } });
    expect(row).toMatchObject({ title: "Alice Secret Goal", status: "active" });
    expect(await getDb().goalMeasurement.count({ where: { goalId: a.goal } })).toBe(1);
  });

  it("Bob cannot replace Alice's goal relationships", async () => {
    const id = { id: a.goal };
    for (const [route, path, body] of [
      [goalProjects.PUT, "projects", { projectIds: [] }],
      [goalSkills.PUT, "skills", { skillIds: [] }],
      [goalMilestones.PUT, "milestones", { milestoneIds: [] }],
      [goalDependencies.PUT, "dependencies", { goalIds: [] }],
    ] as const) {
      expect(
        (await call(route, bob.cookie, "PUT", `/api/v1/goals/${a.goal}/${path}`, id, body)).status,
        path,
      ).toBe(404);
    }
    expect(await getDb().goalProject.count({ where: { goalId: a.goal } })).toBe(1);
    expect(await getDb().milestone.count({ where: { goalId: a.goal } })).toBe(1);
  });

  it("Bob cannot attach Alice's project, skill, milestone, parent or dependency to his goal", async () => {
    const id = { id: b.goal };
    for (const [route, path, body] of [
      [goalProjects.PUT, "projects", { projectIds: [a.project] }],
      [goalSkills.PUT, "skills", { skillIds: [a.skill] }],
      [goalMilestones.PUT, "milestones", { milestoneIds: [a.milestone] }],
      [goalDependencies.PUT, "dependencies", { goalIds: [a.goal] }],
    ] as const) {
      expect(
        (await call(route, bob.cookie, "PUT", `/api/v1/goals/${b.goal}/${path}`, id, body)).status,
        path,
      ).toBe(400);
    }
    expect(
      (
        await call(goalItem.PATCH, bob.cookie, "PATCH", `/api/v1/goals/${b.goal}`, id, {
          parentId: a.star,
        })
      ).status,
    ).toBe(400);
    const created = await call(
      goalsRoute.POST,
      bob.cookie,
      "POST",
      "/api/v1/goals",
      {},
      { title: "Bob child", type: "quarterly_goal", parentId: a.star },
    );
    expect(created.status).toBe(400);
    expect(await getDb().goalProject.count({ where: { goalId: b.goal } })).toBe(0);
    expect((await getDb().milestone.findUnique({ where: { id: a.milestone } }))?.goalId).toBe(
      a.goal,
    );
  });

  it("injected owner ids are ignored; lists, roadmap and analytics never leak", async () => {
    const created = await call(
      goalsRoute.POST,
      bob.cookie,
      "POST",
      "/api/v1/goals",
      {},
      { title: "Bob injected", type: "quarterly_goal", userId: alice.userId },
    );
    expect(created.status).toBe(201);
    expect((await getDb().goal.findUnique({ where: { id: await idOf(created) } }))?.userId).toBe(
      bob.userId,
    );
    for (const [handler, path] of [
      [goalsRoute.GET, `/api/v1/goals?userId=${alice.userId}&projectId=${a.project}`],
      [goalsRoute.GET, `/api/v1/goals?skillId=${a.skill}&parentId=${a.star}`],
      [roadmapRoute.GET, `/api/v1/goals/roadmap?ownerId=${alice.userId}`],
      [goalsAnalyticsRoute.GET, `/api/v1/analytics/goals?userId=${alice.userId}`],
    ] as const) {
      const r = await call(handler, bob.cookie, "GET", path);
      expect(r.status, path).toBe(200);
      const text = await r.text();
      expect(text, path).not.toContain("Alice");
      expect(text, path).not.toContain(a.goal);
    }
  });

  it("invalid input and malformed ids are rejected without leaking", async () => {
    for (const [handler, path] of [
      [goalsRoute.GET, "/api/v1/goals?risk=__proto__"],
      [goalsRoute.GET, "/api/v1/goals?pageSize=1000"],
      [goalsRoute.GET, "/api/v1/goals?sort=userId"],
      [roadmapRoute.GET, "/api/v1/goals/roadmap?from=2020-01-01&to=2030-01-01"],
    ] as const) {
      const r = await call(handler, bob.cookie, "GET", path);
      expect(r.status, path).toBe(400);
      expect(await r.json()).toMatchObject({ code: "VALIDATION_FAILED" });
    }
    expect(
      (
        await call(
          goalsRoute.POST,
          bob.cookie,
          "POST",
          "/api/v1/goals",
          {},
          { title: "x", type: "milestone" },
        )
      ).status,
    ).toBe(400);
    expect(
      (await call(goalItem.GET, bob.cookie, "GET", "/api/v1/goals/nope", { id: "nope" })).status,
    ).toBe(404);
  });
});
