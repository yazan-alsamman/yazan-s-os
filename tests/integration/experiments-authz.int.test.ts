import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as analyticsRoute from "@/app/api/v1/analytics/experiments/route";
import * as evidenceRoute from "@/app/api/v1/evidence/route";
import * as compareRoute from "@/app/api/v1/experiments/[id]/compare/route";
import * as evidenceLink from "@/app/api/v1/experiments/[id]/evidence/route";
import * as intelligence from "@/app/api/v1/experiments/[id]/intelligence/route";
import * as expItem from "@/app/api/v1/experiments/[id]/route";
import * as metricItem from "@/app/api/v1/experiments/[id]/runs/[runId]/metrics/[metricId]/route";
import * as metricsRoute from "@/app/api/v1/experiments/[id]/runs/[runId]/metrics/route";
import * as runItem from "@/app/api/v1/experiments/[id]/runs/[runId]/route";
import * as runsRoute from "@/app/api/v1/experiments/[id]/runs/route";
import * as expRoute from "@/app/api/v1/experiments/route";
import * as projectsRoute from "@/app/api/v1/projects/route";
import { getAuth } from "@/lib/auth/auth";

import { truncateAll } from "./database";

type Handler = (
  request: Request,
  segment: { params: Promise<Record<string, string>> },
) => Promise<Response>;
const BASE = "http://localhost:3100";

async function signUp(label: string) {
  const response = await getAuth().api.signUpEmail({
    body: {
      name: `P6 ${label}`,
      email: `p6-${label}-${crypto.randomUUID()}@peos-test.invalid`,
      password: "phase6-test-passphrase",
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

describe("Phase 6 authorization and user isolation (HTTP)", () => {
  let alice: Awaited<ReturnType<typeof signUp>>;
  let bob: Awaited<ReturnType<typeof signUp>>;
  const a = {} as Record<"experiment" | "run" | "metric" | "evidence" | "project", string>;
  const b = {} as Record<"experiment" | "run", string>;

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
        { name: "Alice Project" },
      ),
    );
    a.evidence = await idOf(
      await call(
        evidenceRoute.POST,
        alice.cookie,
        "POST",
        "/api/v1/evidence",
        {},
        { type: "document", title: "Alice Evidence" },
      ),
    );
    a.experiment = await idOf(
      await call(
        expRoute.POST,
        alice.cookie,
        "POST",
        "/api/v1/experiments",
        {},
        { title: "Alice Secret Experiment" },
      ),
    );
    a.run = await idOf(
      await call(
        runsRoute.POST,
        alice.cookie,
        "POST",
        `/api/v1/experiments/${a.experiment}/runs`,
        { id: a.experiment },
        { model: "secret" },
      ),
    );
    a.metric = await idOf(
      await call(
        metricsRoute.POST,
        alice.cookie,
        "POST",
        `/api/v1/experiments/${a.experiment}/runs/${a.run}/metrics`,
        { id: a.experiment, runId: a.run },
        { name: "accuracy", value: 0.9 },
      ),
    );
    b.experiment = await idOf(
      await call(
        expRoute.POST,
        bob.cookie,
        "POST",
        "/api/v1/experiments",
        {},
        { title: "Bob Experiment" },
      ),
    );
    b.run = await idOf(
      await call(
        runsRoute.POST,
        bob.cookie,
        "POST",
        `/api/v1/experiments/${b.experiment}/runs`,
        { id: b.experiment },
        { model: "bob" },
      ),
    );
  });

  afterAll(() => truncateAll());

  it("every experiment endpoint requires a session", async () => {
    const anon = [
      call(expRoute.GET, null, "GET", "/api/v1/experiments"),
      call(expItem.GET, null, "GET", `/api/v1/experiments/${a.experiment}`, { id: a.experiment }),
      call(intelligence.GET, null, "GET", `/api/v1/experiments/${a.experiment}/intelligence`, {
        id: a.experiment,
      }),
      call(analyticsRoute.GET, null, "GET", "/api/v1/analytics/experiments"),
    ];
    for (const r of await Promise.all(anon)) expect(r.status).toBe(401);
  });

  it("Bob cannot read, update or delete Alice's experiment, dossier or analytics view of it", async () => {
    const id = { id: a.experiment };
    const reads = await Promise.all([
      call(expItem.GET, bob.cookie, "GET", `/api/v1/experiments/${a.experiment}`, id),
      call(
        intelligence.GET,
        bob.cookie,
        "GET",
        `/api/v1/experiments/${a.experiment}/intelligence`,
        id,
      ),
      call(
        compareRoute.GET,
        bob.cookie,
        "GET",
        `/api/v1/experiments/${a.experiment}/compare?a=${a.run}&b=${a.run}`,
        id,
      ),
    ]);
    for (const r of reads) expect(r.status).toBe(404);
    const mutations = await Promise.all([
      call(expItem.PATCH, bob.cookie, "PATCH", `/api/v1/experiments/${a.experiment}`, id, {
        title: "hijack",
      }),
      call(expItem.DELETE, bob.cookie, "DELETE", `/api/v1/experiments/${a.experiment}`, id),
      call(
        evidenceLink.PUT,
        bob.cookie,
        "PUT",
        `/api/v1/experiments/${a.experiment}/evidence`,
        id,
        { evidenceIds: [] },
      ),
    ]);
    for (const r of mutations) expect(r.status).toBe(404);
    // The experiment still exists and is unchanged for Alice.
    expect(
      (await call(expItem.GET, alice.cookie, "GET", `/api/v1/experiments/${a.experiment}`, id))
        .status,
    ).toBe(200);
  });

  it("Bob cannot touch Alice's runs or metrics, nor attach them to his own experiment", async () => {
    const r404 = await Promise.all([
      call(
        runItem.PATCH,
        bob.cookie,
        "PATCH",
        `/api/v1/experiments/${a.experiment}/runs/${a.run}`,
        { id: a.experiment, runId: a.run },
        { model: "x" },
      ),
      call(
        runItem.DELETE,
        bob.cookie,
        "DELETE",
        `/api/v1/experiments/${a.experiment}/runs/${a.run}`,
        { id: a.experiment, runId: a.run },
      ),
      call(
        metricItem.DELETE,
        bob.cookie,
        "DELETE",
        `/api/v1/experiments/${a.experiment}/runs/${a.run}/metrics/${a.metric}`,
        { id: a.experiment, runId: a.run, metricId: a.metric },
      ),
      // Alice's run under Bob's experiment id → not found.
      call(
        runItem.PATCH,
        bob.cookie,
        "PATCH",
        `/api/v1/experiments/${b.experiment}/runs/${a.run}`,
        { id: b.experiment, runId: a.run },
        { model: "x" },
      ),
    ]);
    for (const r of r404) expect(r.status).toBe(404);
  });

  it("Bob cannot link Alice's evidence to his own experiment (foreign target → 400)", async () => {
    const r = await call(
      evidenceLink.PUT,
      bob.cookie,
      "PUT",
      `/api/v1/experiments/${b.experiment}/evidence`,
      { id: b.experiment },
      { evidenceIds: [a.evidence] },
    );
    expect(r.status).toBe(400);
  });

  it("Bob cannot link Alice's project to his experiment (foreign project → 400)", async () => {
    const r = await call(
      expItem.PATCH,
      bob.cookie,
      "PATCH",
      `/api/v1/experiments/${b.experiment}`,
      { id: b.experiment },
      { projectId: a.project },
    );
    expect(r.status).toBe(400);
  });

  it("injected owner ids are ignored and lists/analytics never leak across users", async () => {
    const created = await call(
      expRoute.POST,
      bob.cookie,
      "POST",
      "/api/v1/experiments",
      {},
      { title: "Bob owns this", userId: alice.userId, ownerId: alice.userId },
    );
    expect(created.status).toBe(201);
    const list = (await (
      await call(expRoute.GET, bob.cookie, "GET", "/api/v1/experiments")
    ).json()) as {
      data: { title: string }[];
    };
    expect(list.data.some((e) => e.title === "Alice Secret Experiment")).toBe(false);
    const analytics = (await (
      await call(analyticsRoute.GET, bob.cookie, "GET", "/api/v1/analytics/experiments")
    ).json()) as {
      data: { recordCounts: { experiments: number } };
    };
    expect(analytics.data.recordCounts.experiments).toBe(2); // Bob's own two only
  });

  it("malformed ids 404 and invalid input 400 without leaking", async () => {
    expect(
      (
        await call(expItem.GET, bob.cookie, "GET", "/api/v1/experiments/not-a-uuid", {
          id: "not-a-uuid",
        })
      ).status,
    ).toBe(404);
    expect(
      (await call(expRoute.POST, bob.cookie, "POST", "/api/v1/experiments", {}, { title: "" }))
        .status,
    ).toBe(400);
    expect(
      (
        await call(
          runsRoute.POST,
          bob.cookie,
          "POST",
          `/api/v1/experiments/${b.experiment}/runs`,
          { id: b.experiment },
          { costUsd: -5 },
        )
      ).status,
    ).toBe(400);
  });
});
