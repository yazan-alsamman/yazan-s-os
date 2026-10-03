import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as analyticsRoute from "@/app/api/v1/analytics/architecture/route";
import * as compDeps from "@/app/api/v1/architecture/components/[id]/dependencies/route";
import * as compIntel from "@/app/api/v1/architecture/components/[id]/intelligence/route";
import * as compProjects from "@/app/api/v1/architecture/components/[id]/projects/route";
import * as compItem from "@/app/api/v1/architecture/components/[id]/route";
import * as compTechs from "@/app/api/v1/architecture/components/[id]/technologies/route";
import * as compRoute from "@/app/api/v1/architecture/components/route";
import * as altItem from "@/app/api/v1/architecture/decisions/[id]/alternatives/[alternativeId]/route";
import * as altRoute from "@/app/api/v1/architecture/decisions/[id]/alternatives/route";
import * as decComponents from "@/app/api/v1/architecture/decisions/[id]/components/route";
import * as decEvidence from "@/app/api/v1/architecture/decisions/[id]/evidence/route";
import * as decIntel from "@/app/api/v1/architecture/decisions/[id]/intelligence/route";
import * as decProjects from "@/app/api/v1/architecture/decisions/[id]/projects/route";
import * as decItem from "@/app/api/v1/architecture/decisions/[id]/route";
import * as decRoute from "@/app/api/v1/architecture/decisions/route";
import * as mapRoute from "@/app/api/v1/architecture/map/route";
import * as evidenceRoute from "@/app/api/v1/evidence/route";
import * as projectsRoute from "@/app/api/v1/projects/route";
import * as techRoute from "@/app/api/v1/technologies/route";
import { getAuth } from "@/lib/auth/auth";

import { truncateAll } from "./database";

/**
 * Phase 7 IDOR / user-isolation matrix through the real HTTP handlers with two real sessions.
 * Alice owns decisions, components and their links; Bob attacks every architecture surface.
 */
type Handler = (
  request: Request,
  segment: { params: Promise<Record<string, string>> },
) => Promise<Response>;
const BASE = "http://localhost:3100";

async function signUp(label: string) {
  const response = await getAuth().api.signUpEmail({
    body: {
      name: `P7 ${label}`,
      email: `p7-${label}-${crypto.randomUUID()}@peos-test.invalid`,
      password: "phase7-test-passphrase",
    },
    asResponse: true,
  });
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0]!;
  const { user } = (await response.json()) as { user: { id: string } };
  return { cookie, userId: user.id };
}

function call(
  handler: unknown,
  cookie: string | null,
  method: string,
  path: string,
  params: Record<string, string> = {},
  body?: unknown,
) {
  return (handler as Handler)(
    new Request(`${BASE}${path}`, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        origin: BASE,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
    { params: Promise.resolve(params) },
  );
}
const idOf = async (r: Response) => ((await r.json()) as { data: { id: string } }).data.id;

describe("Phase 7 authorization and user isolation (HTTP)", () => {
  let alice: Awaited<ReturnType<typeof signUp>>;
  let bob: Awaited<ReturnType<typeof signUp>>;
  const a = {} as Record<
    "project" | "evidence" | "tech" | "decision" | "component" | "alternative",
    string
  >;
  const b = {} as Record<"decision" | "component", string>;

  beforeAll(async () => {
    await truncateAll();
    alice = await signUp("alice");
    bob = await signUp("bob");
    const post = (h: unknown, cookie: string, path: string, body: unknown, params = {}) =>
      call(h, cookie, "POST", path, params, body).then(idOf);
    a.project = await post(projectsRoute.POST, alice.cookie, "/api/v1/projects", {
      name: "Alice Project",
    });
    a.evidence = await post(evidenceRoute.POST, alice.cookie, "/api/v1/evidence", {
      type: "document",
      title: "Alice Evidence",
    });
    a.tech = await post(techRoute.POST, alice.cookie, "/api/v1/technologies", {
      name: "Alice Tech",
    });
    a.decision = await post(decRoute.POST, alice.cookie, "/api/v1/architecture/decisions", {
      title: "Alice Secret Decision",
      status: "accepted",
    });
    a.component = await post(compRoute.POST, alice.cookie, "/api/v1/architecture/components", {
      name: "Alice Secret Service",
      type: "service",
      critical: true,
    });
    a.alternative = await post(
      altRoute.POST,
      alice.cookie,
      `/api/v1/architecture/decisions/${a.decision}/alternatives`,
      { name: "Alice option" },
      { id: a.decision },
    );
    b.decision = await post(decRoute.POST, bob.cookie, "/api/v1/architecture/decisions", {
      title: "Bob Decision",
      status: "accepted",
    });
    b.component = await post(compRoute.POST, bob.cookie, "/api/v1/architecture/components", {
      name: "Bob Service",
      type: "service",
    });
  });

  afterAll(() => truncateAll());

  it("every architecture endpoint requires a session", async () => {
    const anon = await Promise.all([
      call(decRoute.GET, null, "GET", "/api/v1/architecture/decisions"),
      call(decItem.GET, null, "GET", `/api/v1/architecture/decisions/${a.decision}`, {
        id: a.decision,
      }),
      call(compRoute.GET, null, "GET", "/api/v1/architecture/components"),
      call(mapRoute.GET, null, "GET", "/api/v1/architecture/map"),
      call(analyticsRoute.GET, null, "GET", "/api/v1/analytics/architecture"),
    ]);
    for (const r of anon) expect(r.status).toBe(401);
  });

  it("Bob cannot read, update or delete Alice's decisions, alternatives or components", async () => {
    const d = { id: a.decision };
    const c = { id: a.component };
    const results = await Promise.all([
      call(decItem.GET, bob.cookie, "GET", `/api/v1/architecture/decisions/${a.decision}`, d),
      call(
        decIntel.GET,
        bob.cookie,
        "GET",
        `/api/v1/architecture/decisions/${a.decision}/intelligence`,
        d,
      ),
      call(decItem.PATCH, bob.cookie, "PATCH", `/api/v1/architecture/decisions/${a.decision}`, d, {
        status: "deprecated",
      }),
      call(decItem.DELETE, bob.cookie, "DELETE", `/api/v1/architecture/decisions/${a.decision}`, d),
      call(
        altRoute.POST,
        bob.cookie,
        "POST",
        `/api/v1/architecture/decisions/${a.decision}/alternatives`,
        d,
        {
          name: "x",
        },
      ),
      call(
        altItem.DELETE,
        bob.cookie,
        "DELETE",
        `/api/v1/architecture/decisions/${a.decision}/alternatives/${a.alternative}`,
        { id: a.decision, alternativeId: a.alternative },
      ),
      call(compItem.GET, bob.cookie, "GET", `/api/v1/architecture/components/${a.component}`, c),
      call(
        compIntel.GET,
        bob.cookie,
        "GET",
        `/api/v1/architecture/components/${a.component}/intelligence`,
        c,
      ),
      call(
        compItem.PATCH,
        bob.cookie,
        "PATCH",
        `/api/v1/architecture/components/${a.component}`,
        c,
        {
          critical: false,
        },
      ),
      call(
        compItem.DELETE,
        bob.cookie,
        "DELETE",
        `/api/v1/architecture/components/${a.component}`,
        c,
      ),
    ]);
    for (const r of results) expect(r.status).toBe(404);
    const still = await call(
      decItem.GET,
      alice.cookie,
      "GET",
      `/api/v1/architecture/decisions/${a.decision}`,
      d,
    );
    expect(((await still.json()) as { data: { status: string } }).data.status).toBe("accepted");
  });

  it("Bob cannot replace the relationships of Alice's records", async () => {
    const d = { id: a.decision };
    const c = { id: a.component };
    const results = await Promise.all([
      call(decProjects.PUT, bob.cookie, "PUT", `/x`, d, { projectIds: [] }),
      call(decEvidence.PUT, bob.cookie, "PUT", `/x`, d, { evidenceIds: [] }),
      call(decComponents.PUT, bob.cookie, "PUT", `/x`, d, { componentIds: [] }),
      call(compProjects.PUT, bob.cookie, "PUT", `/x`, c, { projectIds: [] }),
      call(compTechs.PUT, bob.cookie, "PUT", `/x`, c, { technologyIds: [] }),
      call(compDeps.PUT, bob.cookie, "PUT", `/x`, c, { componentIds: [] }),
    ]);
    for (const r of results) expect(r.status).toBe(404);
  });

  it("Bob cannot link Alice's project, evidence, component, technology or decision to his records", async () => {
    const d = { id: b.decision };
    const c = { id: b.component };
    const results = await Promise.all([
      call(decProjects.PUT, bob.cookie, "PUT", `/x`, d, { projectIds: [a.project] }),
      call(decEvidence.PUT, bob.cookie, "PUT", `/x`, d, { evidenceIds: [a.evidence] }),
      call(decComponents.PUT, bob.cookie, "PUT", `/x`, d, { componentIds: [a.component] }),
      call(compProjects.PUT, bob.cookie, "PUT", `/x`, c, { projectIds: [a.project] }),
      call(compTechs.PUT, bob.cookie, "PUT", `/x`, c, { technologyIds: [a.tech] }),
      call(compDeps.PUT, bob.cookie, "PUT", `/x`, c, { componentIds: [a.component] }),
      call(decItem.PATCH, bob.cookie, "PATCH", `/x`, d, {
        status: "superseded",
        supersededById: a.decision,
      }),
    ]);
    for (const r of results) expect(r.status).toBe(400);
  });

  it("injected owner ids are ignored; lists, map and analytics never leak", async () => {
    const created = await call(
      decRoute.POST,
      bob.cookie,
      "POST",
      "/api/v1/architecture/decisions",
      {},
      {
        title: "Bob owns this",
        userId: alice.userId,
        ownerId: alice.userId,
      },
    );
    expect(created.status).toBe(201);
    const list = (await (
      await call(decRoute.GET, bob.cookie, "GET", "/api/v1/architecture/decisions")
    ).json()) as {
      data: { title: string }[];
    };
    expect(list.data.map((d) => d.title).sort()).toEqual(["Bob Decision", "Bob owns this"]);
    const map = (await (
      await call(mapRoute.GET, bob.cookie, "GET", "/api/v1/architecture/map")
    ).json()) as {
      data: { nodes: { name: string }[] };
    };
    expect(map.data.nodes.map((n) => n.name)).toEqual(["Bob Service"]);
    const stats = (await (
      await call(analyticsRoute.GET, bob.cookie, "GET", "/api/v1/analytics/architecture")
    ).json()) as {
      data: { recordCounts: { decisions: number; components: number } };
    };
    expect(stats.data.recordCounts).toMatchObject({ decisions: 2, components: 1 });
    const filtered = await call(
      decRoute.GET,
      bob.cookie,
      "GET",
      `/api/v1/architecture/decisions?projectId=${a.project}`,
    );
    expect(((await filtered.json()) as { page: { total: number } }).page.total).toBe(0);
  });

  it("malformed ids 404 and invalid input 400 without leaking", async () => {
    expect((await call(decItem.GET, bob.cookie, "GET", "/x", { id: "not-a-uuid" })).status).toBe(
      404,
    );
    expect(
      (
        await call(
          decRoute.POST,
          bob.cookie,
          "POST",
          "/api/v1/architecture/decisions",
          {},
          { title: " " },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          compRoute.POST,
          bob.cookie,
          "POST",
          "/api/v1/architecture/components",
          {},
          { name: "x", type: "monolith" },
        )
      ).status,
    ).toBe(400);
    expect(
      (await call(mapRoute.GET, bob.cookie, "GET", "/api/v1/architecture/map?limit=5000")).status,
    ).toBe(400);
  });
});
