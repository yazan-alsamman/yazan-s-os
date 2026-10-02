import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as certificationEvidenceRoute from "@/app/api/v1/certifications/[id]/evidence/route";
import * as certificationItem from "@/app/api/v1/certifications/[id]/route";
import * as certificationSkillsRoute from "@/app/api/v1/certifications/[id]/skills/route";
import * as certificationsRoute from "@/app/api/v1/certifications/route";
import * as educationItem from "@/app/api/v1/education/[id]/route";
import * as educationRoute from "@/app/api/v1/education/route";
import * as evidenceItem from "@/app/api/v1/evidence/[id]/route";
import * as evidenceRoute from "@/app/api/v1/evidence/route";
import * as experienceEvidenceRoute from "@/app/api/v1/experiences/[id]/evidence/route";
import * as experienceItem from "@/app/api/v1/experiences/[id]/route";
import * as experiencesRoute from "@/app/api/v1/experiences/route";
import * as exportRoute from "@/app/api/v1/export/route";
import * as profileRoute from "@/app/api/v1/profile/route";
import * as projectEvidenceRoute from "@/app/api/v1/projects/[id]/evidence/route";
import * as projectItem from "@/app/api/v1/projects/[id]/route";
import * as projectSkillsRoute from "@/app/api/v1/projects/[id]/skills/route";
import * as projectTechnologiesRoute from "@/app/api/v1/projects/[id]/technologies/route";
import * as projectsRoute from "@/app/api/v1/projects/route";
import * as searchRoute from "@/app/api/v1/search/route";
import * as skillEvidenceRoute from "@/app/api/v1/skills/[id]/evidence/route";
import * as skillItem from "@/app/api/v1/skills/[id]/route";
import * as skillsRoute from "@/app/api/v1/skills/route";
import * as technologyItem from "@/app/api/v1/technologies/[id]/route";
import * as technologiesRoute from "@/app/api/v1/technologies/route";
import { getAuth } from "@/lib/auth/auth";
import { getDb } from "@/lib/db/client";

import { truncateAll } from "./database";

/**
 * IDOR matrix through the real HTTP route handlers with real session cookies (spec 07,
 * prompt §22). User B tries to read, modify, delete and link User A's records by id.
 */
type Handler = (
  request: Request,
  segment: { params: Promise<Record<string, string>> },
) => Promise<Response>;

const BASE = "http://localhost:3100";

async function signUp(label: string) {
  const response = await getAuth().api.signUpEmail({
    body: {
      name: `IDOR ${label}`,
      email: `idor-${label}-${crypto.randomUUID()}@peos-test.invalid`,
      password: "idor-test-passphrase",
    },
    asResponse: true,
  });
  return (response.headers.get("set-cookie") ?? "").split(";")[0]!;
}

function call(
  handler: unknown,
  cookie: string,
  method: string,
  path: string,
  params: Record<string, string> = {},
  body?: unknown,
) {
  const request = new Request(`${BASE}${path}`, {
    method,
    headers: { cookie, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return (handler as Handler)(request, { params: Promise.resolve(params) });
}

async function json(response: Response) {
  return (await response.json()) as { data: Record<string, unknown> & { id: string } };
}

describe("IDOR protection (HTTP layer, two real users)", () => {
  let alice: string;
  let bob: string;
  const ids = {} as Record<
    "skill" | "technology" | "evidence" | "project" | "certification" | "experience" | "education",
    string
  >;

  beforeAll(async () => {
    await truncateAll();
    alice = await signUp("alice");
    bob = await signUp("bob");

    ids.skill = (
      await json(
        await call(skillsRoute.POST, alice, "POST", "/api/v1/skills", {}, { name: "Alice Skill" }),
      )
    ).data.id;
    ids.technology = (
      await json(
        await call(
          technologiesRoute.POST,
          alice,
          "POST",
          "/api/v1/technologies",
          {},
          { name: "Alice Tech" },
        ),
      )
    ).data.id;
    ids.evidence = (
      await json(
        await call(
          evidenceRoute.POST,
          alice,
          "POST",
          "/api/v1/evidence",
          {},
          { type: "document", title: "Alice Evidence" },
        ),
      )
    ).data.id;
    ids.project = (
      await json(
        await call(
          projectsRoute.POST,
          alice,
          "POST",
          "/api/v1/projects",
          {},
          { name: "Alice Project", skillIds: [ids.skill], evidenceIds: [ids.evidence] },
        ),
      )
    ).data.id;
    ids.certification = (
      await json(
        await call(
          certificationsRoute.POST,
          alice,
          "POST",
          "/api/v1/certifications",
          {},
          { name: "Alice Cert", issuer: "Issuer" },
        ),
      )
    ).data.id;
    ids.experience = (
      await json(
        await call(
          experiencesRoute.POST,
          alice,
          "POST",
          "/api/v1/experiences",
          {},
          { organization: "Alice Org", title: "Role", startDate: "2020-01-01" },
        ),
      )
    ).data.id;
    ids.education = (
      await json(
        await call(
          educationRoute.POST,
          alice,
          "POST",
          "/api/v1/education",
          {},
          { institution: "Alice University" },
        ),
      )
    ).data.id;
    await call(
      profileRoute.PATCH,
      alice,
      "PATCH",
      "/api/v1/profile",
      {},
      { headline: "Alice headline" },
    );
  });

  afterAll(() => getDb().$disconnect());

  const items = [
    { name: "projects", route: projectItem, key: "project", patch: { name: "Hijacked" } },
    { name: "skills", route: skillItem, key: "skill", patch: { name: "Hijacked" } },
    { name: "technologies", route: technologyItem, key: "technology", patch: { name: "Hijacked" } },
    {
      name: "certifications",
      route: certificationItem,
      key: "certification",
      patch: { name: "Hijacked" },
    },
    { name: "evidence", route: evidenceItem, key: "evidence", patch: { title: "Hijacked" } },
    { name: "experiences", route: experienceItem, key: "experience", patch: { title: "Hijacked" } },
    {
      name: "education",
      route: educationItem,
      key: "education",
      patch: { institution: "Hijacked" },
    },
  ] as const;

  for (const item of items) {
    it(`${item.name}: GET/PATCH/DELETE another user's record → 404, record unchanged`, async () => {
      const id = ids[item.key];
      const path = `/api/v1/${item.name}/${id}`;
      for (const [method, handler, body] of [
        ["GET", item.route.GET, undefined],
        ["PATCH", item.route.PATCH, item.patch],
        ["DELETE", item.route.DELETE, undefined],
      ] as const) {
        const response = await call(handler, bob, method, path, { id }, body);
        expect(response.status, `${method} ${path}`).toBe(404);
        expect(await response.json()).toMatchObject({ code: "NOT_FOUND" });
      }
      const own = await call(item.route.GET, alice, "GET", path, { id });
      expect(own.status).toBe(200);
      expect(JSON.stringify(await own.json())).not.toContain("Hijacked");
    });
  }

  it("relationship endpoints: cannot modify another user's record's links", async () => {
    const cases = [
      [projectSkillsRoute.PUT, `projects/${ids.project}/skills`, ids.project, { skillIds: [] }],
      [
        projectTechnologiesRoute.PUT,
        `projects/${ids.project}/technologies`,
        ids.project,
        { technologies: [] },
      ],
      [
        projectEvidenceRoute.PUT,
        `projects/${ids.project}/evidence`,
        ids.project,
        { evidenceIds: [] },
      ],
      [skillEvidenceRoute.PUT, `skills/${ids.skill}/evidence`, ids.skill, { evidence: [] }],
      [
        certificationSkillsRoute.PUT,
        `certifications/${ids.certification}/skills`,
        ids.certification,
        { skillIds: [] },
      ],
      [
        certificationEvidenceRoute.PUT,
        `certifications/${ids.certification}/evidence`,
        ids.certification,
        { evidenceIds: [] },
      ],
      [
        experienceEvidenceRoute.PUT,
        `experiences/${ids.experience}/evidence`,
        ids.experience,
        { evidenceIds: [] },
      ],
    ] as const;
    for (const [handler, path, id, body] of cases) {
      const response = await call(handler, bob, "PUT", `/api/v1/${path}`, { id }, body);
      expect(response.status, path).toBe(404);
    }
    const project = await json(
      await call(projectItem.GET, alice, "GET", `/api/v1/projects/${ids.project}`, {
        id: ids.project,
      }),
    );
    expect((project.data.skills as unknown[]).length).toBe(1);
  });

  it("cannot link another user's records into one's own record (join-record IDOR)", async () => {
    const own = await json(
      await call(projectsRoute.POST, bob, "POST", "/api/v1/projects", {}, { name: "Bob Project" }),
    );
    for (const [handler, segment, body] of [
      [projectSkillsRoute.PUT, "skills", { skillIds: [ids.skill] }],
      [projectEvidenceRoute.PUT, "evidence", { evidenceIds: [ids.evidence] }],
      [
        projectTechnologiesRoute.PUT,
        "technologies",
        { technologies: [{ technologyId: ids.technology }] },
      ],
    ] as const) {
      const response = await call(
        handler,
        bob,
        "PUT",
        `/api/v1/projects/${own.data.id}/${segment}`,
        { id: own.data.id },
        body,
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: "VALIDATION_FAILED",
        message: "One or more related records do not exist.",
      });
    }
    const create = await call(
      projectsRoute.POST,
      bob,
      "POST",
      "/api/v1/projects",
      {},
      { name: "Sneaky", skillIds: [ids.skill] },
    );
    expect(create.status).toBe(400);
  });

  it("lists, search, profile and export never include another user's data", async () => {
    for (const [handler, path] of [
      [projectsRoute.GET, "/api/v1/projects"],
      [skillsRoute.GET, "/api/v1/skills"],
      [technologiesRoute.GET, "/api/v1/technologies"],
      [certificationsRoute.GET, "/api/v1/certifications"],
      [evidenceRoute.GET, "/api/v1/evidence"],
      [experiencesRoute.GET, "/api/v1/experiences"],
      [educationRoute.GET, "/api/v1/education"],
      [searchRoute.GET, "/api/v1/search?q=Alice"],
    ] as const) {
      const response = await call(handler, bob, "GET", path);
      expect(response.status, path).toBe(200);
      expect(JSON.stringify(await response.json()), path).not.toContain("Alice");
    }
    const profile = await json(await call(profileRoute.GET, bob, "GET", "/api/v1/profile"));
    expect(profile.data.headline).toBeNull();
    const exported = await (
      await call(exportRoute.GET, bob, "GET", "/api/v1/export?format=json")
    ).text();
    expect(exported).not.toContain("Alice");
  });

  it("unauthenticated requests are rejected before any data access", async () => {
    const response = await call(projectItem.GET, "", "GET", `/api/v1/projects/${ids.project}`, {
      id: ids.project,
    });
    expect(response.status).toBe(401);
  });

  it("cross-origin browser mutations are refused (CSRF defense in depth)", async () => {
    const request = new Request(`${BASE}/api/v1/projects`, {
      method: "POST",
      headers: {
        cookie: alice,
        "content-type": "application/json",
        origin: "https://evil.example",
      },
      body: JSON.stringify({ name: "CSRF" }),
    });
    const response = await (projectsRoute.POST as unknown as Handler)(request, {
      params: Promise.resolve({}),
    });
    expect(response.status).toBe(403);
  });

  it("malformed ids are 404, malformed bodies are 400/415 — never 500", async () => {
    expect(
      (
        await call(projectItem.GET, alice, "GET", "/api/v1/projects/not-a-uuid", {
          id: "not-a-uuid",
        })
      ).status,
    ).toBe(404);
    const badJson = await (projectsRoute.POST as unknown as Handler)(
      new Request(`${BASE}/api/v1/projects`, {
        method: "POST",
        headers: { cookie: alice, "content-type": "application/json" },
        body: "{",
      }),
      { params: Promise.resolve({}) },
    );
    expect(badJson.status).toBe(400);
    const wrongType = await (projectsRoute.POST as unknown as Handler)(
      new Request(`${BASE}/api/v1/projects`, {
        method: "POST",
        headers: { cookie: alice, "content-type": "text/plain" },
        body: "x",
      }),
      { params: Promise.resolve({}) },
    );
    expect(wrongType.status).toBe(415);
  });
});
