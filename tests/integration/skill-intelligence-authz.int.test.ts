import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as careerGraphRoute from "@/app/api/v1/analytics/career-graph/route";
import * as skillsAnalyticsRoute from "@/app/api/v1/analytics/skills/route";
import * as evidenceRoute from "@/app/api/v1/evidence/route";
import * as levelModelItem from "@/app/api/v1/skill-level-models/[id]/route";
import * as levelModelsRoute from "@/app/api/v1/skill-level-models/route";
import * as skillEvidenceRoute from "@/app/api/v1/skills/[id]/evidence/route";
import * as skillIntelligenceItem from "@/app/api/v1/skills/[id]/intelligence/route";
import * as skillItem from "@/app/api/v1/skills/[id]/route";
import * as skillTechnologiesRoute from "@/app/api/v1/skills/[id]/technologies/route";
import * as skillIntelligenceRoute from "@/app/api/v1/skills/intelligence/route";
import * as skillsRoute from "@/app/api/v1/skills/route";
import * as technologiesRoute from "@/app/api/v1/technologies/route";
import { getAuth } from "@/lib/auth/auth";
import { getDb } from "@/lib/db/client";

import { truncateAll } from "./database";

/**
 * Phase 4 IDOR / user-isolation matrix through the real HTTP handlers. Alice owns skills with
 * evidence, a technology link and a custom level model. Bob attacks every Phase 4 surface.
 */
type Handler = (
  request: Request,
  segment: { params: Promise<Record<string, string>> },
) => Promise<Response>;
const BASE = "http://localhost:3100";

async function signUp(label: string) {
  const response = await getAuth().api.signUpEmail({
    body: {
      name: `P4 ${label}`,
      email: `p4-${label}-${crypto.randomUUID()}@peos-test.invalid`,
      password: "phase4-test-passphrase",
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
const levels = [0, 1, 2, 3, 4, 5].map((value) => ({ value, label: `Alice tier ${value}` }));

describe("Phase 4 authorization and user isolation (HTTP)", () => {
  let alice: Awaited<ReturnType<typeof signUp>>;
  let bob: Awaited<ReturnType<typeof signUp>>;
  let aliceSkill: string;
  let aliceTech: string;
  let aliceModel: string;
  let aliceEvidence: string;
  let bobSkill: string;

  beforeAll(async () => {
    await truncateAll();
    alice = await signUp("alice");
    bob = await signUp("bob");
    aliceSkill = await idOf(
      await call(
        skillsRoute.POST,
        alice.cookie,
        "POST",
        "/api/v1/skills",
        {},
        {
          name: "Alice Secret Skill",
          targetLevel: 4,
        },
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
          verified: true,
        },
      ),
    );
    await call(
      skillEvidenceRoute.PUT,
      alice.cookie,
      "PUT",
      `/api/v1/skills/${aliceSkill}/evidence`,
      { id: aliceSkill },
      { evidence: [{ evidenceId: aliceEvidence, strength: "strong" }] },
    );
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
    const linked = await call(
      skillTechnologiesRoute.PUT,
      alice.cookie,
      "PUT",
      `/api/v1/skills/${aliceSkill}/technologies`,
      { id: aliceSkill },
      { technologyIds: [aliceTech] },
    );
    expect(linked.status).toBe(200);
    const model = await call(
      levelModelsRoute.POST,
      alice.cookie,
      "POST",
      "/api/v1/skill-level-models",
      {},
      {
        name: "Alice Secret Model",
        levels,
      },
    );
    expect(model.status).toBe(201);
    aliceModel = await idOf(model);
    bobSkill = await idOf(
      await call(skillsRoute.POST, bob.cookie, "POST", "/api/v1/skills", {}, { name: "Bob Skill" }),
    );
  });

  afterAll(() => getDb().$disconnect());

  it("every Phase 4 endpoint requires a session", async () => {
    for (const [handler, path, params] of [
      [skillIntelligenceRoute.GET, "/api/v1/skills/intelligence", {}],
      [skillIntelligenceItem.GET, `/api/v1/skills/${aliceSkill}/intelligence`, { id: aliceSkill }],
      [skillsAnalyticsRoute.GET, "/api/v1/analytics/skills", {}],
      [careerGraphRoute.GET, "/api/v1/analytics/career-graph", {}],
      [levelModelsRoute.GET, "/api/v1/skill-level-models", {}],
      [levelModelItem.GET, `/api/v1/skill-level-models/${aliceModel}`, { id: aliceModel }],
    ] as const) {
      expect((await call(handler, "", "GET", path, params)).status, path).toBe(401);
    }
  });

  it("Bob cannot read Alice's skill intelligence, skill or level model", async () => {
    for (const [handler, path, id] of [
      [skillIntelligenceItem.GET, `/api/v1/skills/${aliceSkill}/intelligence`, aliceSkill],
      [skillItem.GET, `/api/v1/skills/${aliceSkill}`, aliceSkill],
      [levelModelItem.GET, `/api/v1/skill-level-models/${aliceModel}`, aliceModel],
    ] as const) {
      const r = await call(handler, bob.cookie, "GET", path, { id });
      expect(r.status, path).toBe(404);
      expect(await r.text()).not.toContain("Alice");
    }
  });

  it("Bob cannot modify Alice's level model or her skill's technology links", async () => {
    const mid = { id: aliceModel };
    const path = `/api/v1/skill-level-models/${aliceModel}`;
    expect(
      (await call(levelModelItem.PATCH, bob.cookie, "PATCH", path, mid, { name: "pwned" })).status,
    ).toBe(404);
    expect((await call(levelModelItem.DELETE, bob.cookie, "DELETE", path, mid)).status).toBe(404);
    expect(
      (
        await call(
          skillTechnologiesRoute.PUT,
          bob.cookie,
          "PUT",
          `/api/v1/skills/${aliceSkill}/technologies`,
          { id: aliceSkill },
          {
            technologyIds: [],
          },
        )
      ).status,
    ).toBe(404);
    expect(await getDb().technologySkill.count({ where: { skillId: aliceSkill } })).toBe(1);
    expect((await getDb().skillLevelModel.findUnique({ where: { id: aliceModel } }))?.name).toBe(
      "Alice Secret Model",
    );
  });

  it("Bob cannot use Alice's level model or link Alice's technology to his own skill", async () => {
    const assign = await call(
      skillItem.PATCH,
      bob.cookie,
      "PATCH",
      `/api/v1/skills/${bobSkill}`,
      { id: bobSkill },
      {
        levelModelId: aliceModel,
      },
    );
    expect(assign.status).toBe(400);
    const link = await call(
      skillTechnologiesRoute.PUT,
      bob.cookie,
      "PUT",
      `/api/v1/skills/${bobSkill}/technologies`,
      { id: bobSkill },
      { technologyIds: [aliceTech] },
    );
    expect(link.status).toBe(400);
    expect(await getDb().technologySkill.count({ where: { skillId: bobSkill } })).toBe(0);
  });

  it("lists, analytics and the career graph contain only the caller's records", async () => {
    for (const [handler, path] of [
      [skillIntelligenceRoute.GET, `/api/v1/skills/intelligence?userId=${alice.userId}`],
      [skillsAnalyticsRoute.GET, `/api/v1/analytics/skills?ownerId=${alice.userId}`],
      [
        careerGraphRoute.GET,
        `/api/v1/analytics/career-graph?types=skill,technology,evidence&userId=${alice.userId}`,
      ],
      [levelModelsRoute.GET, "/api/v1/skill-level-models"],
    ] as const) {
      const r = await call(handler, bob.cookie, "GET", path);
      expect(r.status, path).toBe(200);
      const text = await r.text();
      expect(text, path).not.toContain("Alice");
      expect(text, path).not.toContain(aliceSkill);
    }
    const list = (await (
      await call(skillIntelligenceRoute.GET, bob.cookie, "GET", "/api/v1/skills/intelligence")
    ).json()) as {
      data: { name: string }[];
    };
    expect(list.data.map((r) => r.name)).toEqual(["Bob Skill"]);
  });

  it("the career graph cannot be focused on another user's record", async () => {
    for (const [type, id] of [
      ["skill", aliceSkill],
      ["technology", aliceTech],
      ["evidence", aliceEvidence],
    ] as const) {
      const r = await call(
        careerGraphRoute.GET,
        bob.cookie,
        "GET",
        `/api/v1/analytics/career-graph?focusType=${type}&focusId=${id}`,
      );
      expect(r.status, type).toBe(404);
      expect(await r.text()).not.toContain("Alice");
    }
  });

  it("invalid filters and malformed ids are rejected without leaking data", async () => {
    for (const [handler, path] of [
      [skillIntelligenceRoute.GET, "/api/v1/skills/intelligence?freshness=__proto__"],
      [skillIntelligenceRoute.GET, "/api/v1/skills/intelligence?pageSize=1000"],
      [skillIntelligenceRoute.GET, "/api/v1/skills/intelligence?sort=userId"],
      [careerGraphRoute.GET, "/api/v1/analytics/career-graph?types=goal"],
      [careerGraphRoute.GET, "/api/v1/analytics/career-graph?limit=100000"],
      [careerGraphRoute.GET, "/api/v1/analytics/career-graph?focusType=skill"],
      [careerGraphRoute.GET, "/api/v1/analytics/career-graph?focusType=skill&focusId=not-a-uuid"],
    ] as const) {
      const r = await call(handler, bob.cookie, "GET", path);
      expect(r.status, path).toBe(400);
      expect(await r.json()).toMatchObject({ code: "VALIDATION_FAILED" });
    }
    const bad = await call(
      levelModelsRoute.POST,
      bob.cookie,
      "POST",
      "/api/v1/skill-level-models",
      {},
      {
        name: "Broken",
        levels: levels.slice(0, 3),
      },
    );
    expect(bad.status).toBe(400);
    expect(
      (
        await call(skillIntelligenceItem.GET, bob.cookie, "GET", "/api/v1/skills/x/intelligence", {
          id: "x",
        })
      ).status,
    ).toBe(404);
  });
});
