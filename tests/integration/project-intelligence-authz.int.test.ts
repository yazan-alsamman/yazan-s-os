import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as portfolioRoute from "@/app/api/v1/analytics/portfolio/route";
import * as projectHealthRoute from "@/app/api/v1/analytics/project-health/route";
import * as evidenceRoute from "@/app/api/v1/evidence/route";
import * as milestoneItem from "@/app/api/v1/milestones/[id]/route";
import * as milestonesRoute from "@/app/api/v1/milestones/route";
import * as projectActivityRoute from "@/app/api/v1/projects/[id]/activity/route";
import * as projectEvidenceRoute from "@/app/api/v1/projects/[id]/evidence/route";
import * as projectIntelligenceRoute from "@/app/api/v1/projects/[id]/intelligence/route";
import * as projectMilestonesRoute from "@/app/api/v1/projects/[id]/milestones/route";
import * as projectItem from "@/app/api/v1/projects/[id]/route";
import * as projectTechnologiesRoute from "@/app/api/v1/projects/[id]/technologies/route";
import * as projectsRoute from "@/app/api/v1/projects/route";
import * as technologiesRoute from "@/app/api/v1/technologies/route";
import { getAuth } from "@/lib/auth/auth";
import { getDb } from "@/lib/db/client";

import { truncateAll } from "./database";

/**
 * Phase 3 IDOR / user-isolation matrix through the real HTTP handlers (prompt §25). Alice owns a
 * project with a milestone, evidence and a technology. Bob attacks every Phase 3 surface by id.
 * A foreign id must behave exactly like a missing id, and nothing of Alice's may change or leak.
 */
type Handler = (
  request: Request,
  segment: { params: Promise<Record<string, string>> },
) => Promise<Response>;
const BASE = "http://localhost:3100";

async function signUp(label: string) {
  const response = await getAuth().api.signUpEmail({
    body: {
      name: `P3 ${label}`,
      email: `p3-${label}-${crypto.randomUUID()}@peos-test.invalid`,
      password: "phase3-test-passphrase",
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
      headers: {
        cookie,
        origin: BASE,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
    { params: Promise.resolve(params) },
  );
}

const json = async (r: Response) => (await r.json()) as { data: unknown } & Record<string, unknown>;
const idOf = async (r: Response) => ((await json(r)).data as { id: string }).id;

describe("Phase 3 authorization and user isolation (HTTP)", () => {
  let alice: Awaited<ReturnType<typeof signUp>>;
  let bob: Awaited<ReturnType<typeof signUp>>;
  let aliceProject: string;
  let aliceMilestone: string;
  let aliceEvidence: string;
  let aliceTech: string;
  let bobProject: string;
  let bobMilestone: string;

  beforeAll(async () => {
    await truncateAll();
    alice = await signUp("alice");
    bob = await signUp("bob");
    aliceTech = await idOf(
      await call(
        technologiesRoute.POST,
        alice.cookie,
        "POST",
        "/api/v1/technologies",
        {},
        { name: "Alice Secret Tech" },
      ),
    );
    aliceEvidence = await idOf(
      await call(
        evidenceRoute.POST,
        alice.cookie,
        "POST",
        "/api/v1/evidence",
        {},
        {
          type: "document",
          title: "Alice Secret Evidence",
          date: "2026-01-01",
        },
      ),
    );
    aliceProject = await idOf(
      await call(
        projectsRoute.POST,
        alice.cookie,
        "POST",
        "/api/v1/projects",
        {},
        {
          name: "Alice Secret Project",
          status: "development",
          technologies: [{ technologyId: aliceTech, usageType: "core" }],
          evidenceIds: [aliceEvidence],
        },
      ),
    );
    const created = await call(
      projectMilestonesRoute.POST,
      alice.cookie,
      "POST",
      `/api/v1/projects/${aliceProject}/milestones`,
      { id: aliceProject },
      { title: "Alice Secret Milestone", dueDate: "2020-01-01" },
    );
    expect(created.status).toBe(201);
    aliceMilestone = await idOf(created);
    bobProject = await idOf(
      await call(
        projectsRoute.POST,
        bob.cookie,
        "POST",
        "/api/v1/projects",
        {},
        { name: "Bob Project" },
      ),
    );
    bobMilestone = await idOf(
      await call(
        projectMilestonesRoute.POST,
        bob.cookie,
        "POST",
        `/api/v1/projects/${bobProject}/milestones`,
        { id: bobProject },
        { title: "Bob Milestone" },
      ),
    );
  });

  afterAll(() => getDb().$disconnect());

  it("every Phase 3 endpoint requires a session", async () => {
    const id = { id: aliceProject };
    for (const [handler, path, params] of [
      [milestonesRoute.GET, "/api/v1/milestones", {}],
      [milestoneItem.GET, `/api/v1/milestones/${aliceMilestone}`, { id: aliceMilestone }],
      [projectMilestonesRoute.GET, `/api/v1/projects/${aliceProject}/milestones`, id],
      [projectIntelligenceRoute.GET, `/api/v1/projects/${aliceProject}/intelligence`, id],
      [projectActivityRoute.GET, `/api/v1/projects/${aliceProject}/activity`, id],
      [portfolioRoute.GET, "/api/v1/analytics/portfolio", {}],
      [projectHealthRoute.GET, "/api/v1/analytics/project-health", {}],
    ] as const) {
      expect((await call(handler, "", "GET", path, params)).status, path).toBe(401);
    }
  });

  it("projects: Bob cannot read, update or delete Alice's project", async () => {
    const id = { id: aliceProject };
    const path = `/api/v1/projects/${aliceProject}`;
    expect((await call(projectItem.GET, bob.cookie, "GET", path, id)).status).toBe(404);
    expect(
      (await call(projectItem.PATCH, bob.cookie, "PATCH", path, id, { name: "pwned" })).status,
    ).toBe(404);
    expect((await call(projectItem.DELETE, bob.cookie, "DELETE", path, id)).status).toBe(404);
    const still = await getDb().project.findUnique({ where: { id: aliceProject } });
    expect(still?.name).toBe("Alice Secret Project");
  });

  it("milestones: Bob cannot list, create under, read, update or delete Alice's", async () => {
    const pid = { id: aliceProject };
    expect(
      (
        await call(
          projectMilestonesRoute.GET,
          bob.cookie,
          "GET",
          `/api/v1/projects/${aliceProject}/milestones`,
          pid,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call(
          projectMilestonesRoute.POST,
          bob.cookie,
          "POST",
          `/api/v1/projects/${aliceProject}/milestones`,
          pid,
          {
            title: "Injected",
          },
        )
      ).status,
    ).toBe(404);
    const mid = { id: aliceMilestone };
    const path = `/api/v1/milestones/${aliceMilestone}`;
    expect((await call(milestoneItem.GET, bob.cookie, "GET", path, mid)).status).toBe(404);
    expect(
      (await call(milestoneItem.PATCH, bob.cookie, "PATCH", path, mid, { status: "completed" }))
        .status,
    ).toBe(404);
    expect((await call(milestoneItem.DELETE, bob.cookie, "DELETE", path, mid)).status).toBe(404);

    const rows = await getDb().milestone.findMany({ where: { projectId: aliceProject } });
    expect(rows.map((m) => [m.title, m.status])).toEqual([["Alice Secret Milestone", "planned"]]);
  });

  it("milestones cannot be moved or attached to another owner's project; owner ids are ignored", async () => {
    const r = await call(
      milestoneItem.PATCH,
      bob.cookie,
      "PATCH",
      `/api/v1/milestones/${bobMilestone}`,
      { id: bobMilestone },
      { title: "Bob Milestone v2", projectId: aliceProject, userId: alice.userId },
    );
    expect(r.status).toBe(200);
    const row = await getDb().milestone.findUnique({ where: { id: bobMilestone } });
    expect(row).toMatchObject({
      projectId: bobProject,
      userId: bob.userId,
      title: "Bob Milestone v2",
    });

    const created = await call(
      projectMilestonesRoute.POST,
      bob.cookie,
      "POST",
      `/api/v1/projects/${bobProject}/milestones`,
      { id: bobProject },
      { title: "Bob M2", projectId: aliceProject, userId: alice.userId },
    );
    expect(created.status).toBe(201);
    expect((await json(created)).data).toMatchObject({ projectId: bobProject });
  });

  it("lists and filters never reveal Alice's records to Bob", async () => {
    const ms = await json(
      await call(
        milestonesRoute.GET,
        bob.cookie,
        "GET",
        `/api/v1/milestones?projectId=${aliceProject}&userId=${alice.userId}`,
      ),
    );
    expect(ms.data).toEqual([]);
    const ev = await json(
      await call(
        evidenceRoute.GET,
        bob.cookie,
        "GET",
        `/api/v1/evidence?projectId=${aliceProject}`,
      ),
    );
    expect(ev.data).toEqual([]);
    const projectsWithEvidence = await json(
      await call(
        projectsRoute.GET,
        bob.cookie,
        "GET",
        `/api/v1/projects?hasEvidence=true&technologyId=${aliceTech}`,
      ),
    );
    expect(projectsWithEvidence.data).toEqual([]);
  });

  it("dossier intelligence and activity of a foreign project are 404", async () => {
    const id = { id: aliceProject };
    for (const [handler, path] of [
      [projectIntelligenceRoute.GET, `/api/v1/projects/${aliceProject}/intelligence`],
      [projectActivityRoute.GET, `/api/v1/projects/${aliceProject}/activity`],
    ] as const) {
      const r = await call(handler, bob.cookie, "GET", path, id);
      expect(r.status, path).toBe(404);
      expect(await r.text()).not.toContain("Alice");
    }
    const own = await call(
      projectIntelligenceRoute.GET,
      alice.cookie,
      "GET",
      `/api/v1/projects/${aliceProject}/intelligence`,
      id,
    );
    expect(own.status).toBe(200);
  });

  it("relationships: Bob cannot link Alice's evidence or technology to his project", async () => {
    const id = { id: bobProject };
    expect(
      (
        await call(
          projectEvidenceRoute.PUT,
          bob.cookie,
          "PUT",
          `/api/v1/projects/${bobProject}/evidence`,
          id,
          {
            evidenceIds: [aliceEvidence],
          },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          projectTechnologiesRoute.PUT,
          bob.cookie,
          "PUT",
          `/api/v1/projects/${bobProject}/technologies`,
          id,
          {
            technologies: [{ technologyId: aliceTech }],
          },
        )
      ).status,
    ).toBe(400);
    expect(await getDb().projectEvidence.count({ where: { projectId: bobProject } })).toBe(0);
  });

  it("portfolio analytics and the computed-health list contain only the caller's projects", async () => {
    for (const [handler, path] of [
      [portfolioRoute.GET, `/api/v1/analytics/portfolio?range=all&userId=${alice.userId}`],
      [projectHealthRoute.GET, `/api/v1/analytics/project-health?ownerId=${alice.userId}`],
    ] as const) {
      const r = await call(handler, bob.cookie, "GET", path);
      expect(r.status, path).toBe(200);
      const text = await r.text();
      expect(text, path).not.toContain("Alice");
      expect(text, path).not.toContain(aliceProject);
    }
    const bobPortfolio = (
      await json(await call(portfolioRoute.GET, bob.cookie, "GET", "/api/v1/analytics/portfolio"))
    ).data as { recordCounts: { projects: number; milestones: number } };
    expect(bobPortfolio.recordCounts).toEqual({ projects: 1, milestones: 2 });
  });

  it("invalid input is rejected without leaking data", async () => {
    for (const [handler, path] of [
      [portfolioRoute.GET, "/api/v1/analytics/portfolio?range=custom&from=2026-01-01"],
      [
        portfolioRoute.GET,
        "/api/v1/analytics/portfolio?range=custom&from=1900-01-01&to=2100-01-01",
      ],
      [projectHealthRoute.GET, "/api/v1/analytics/project-health?computed=__proto__"],
      [milestonesRoute.GET, "/api/v1/milestones?overdue=yes"],
      [milestonesRoute.GET, "/api/v1/milestones?pageSize=10000"],
    ] as const) {
      const r = await call(handler, bob.cookie, "GET", path);
      expect(r.status, path).toBe(400);
      expect(await r.json()).toMatchObject({ code: "VALIDATION_FAILED" });
    }
    // Malformed path ids are "not found" (Phase 1 convention: never a database error).
    expect(
      (
        await call(milestoneItem.GET, bob.cookie, "GET", "/api/v1/milestones/not-a-uuid", {
          id: "not-a-uuid",
        })
      ).status,
    ).toBe(404);
  });
});
