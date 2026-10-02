import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getDb } from "@/lib/db/client";
import { parseInput } from "@/lib/validation/parse";
import { createExportService } from "@/modules/exports/export.service";
import { listImportRecordsQuerySchema } from "@/modules/imports/import.schemas";
import { createImportService } from "@/modules/imports/import.service";
import { createProjectSchema } from "@/modules/projects/project.schemas";
import { createProjectService } from "@/modules/projects/project.service";
import { createSearchService, searchQuerySchema } from "@/modules/search/search.service";
import { createSkillSchema } from "@/modules/skills/skill.schemas";
import { createSkillService } from "@/modules/skills/skill.service";

import { contextFor, createTestUser, truncateAll } from "./database";

const db = getDb();
const imports = createImportService(db);
const exportsSvc = createExportService(db);

/** Synthetic exchange document — clearly fictional test fixture data. */
function exchangeDocument() {
  return {
    format: "peos.exchange",
    version: 1,
    profile: {
      name: "Fixture Person",
      headline: "Fixture headline",
      website: "https://fixture.invalid",
    },
    skills: [
      {
        name: "Fixture Skill",
        category: "Testing",
        targetLevel: 3,
        evidence: [{ title: "Fixture Doc", strength: "strong" }],
      },
      { name: "Bad Skill", targetLevel: 99 },
    ],
    technologies: [{ name: "Fixture DB", version: "1" }],
    evidence: [{ type: "document", title: "Fixture Doc", date: "2025-05-01" }],
    experiences: [
      {
        organization: "Fixture Org",
        title: "Engineer",
        startDate: "Mar 2021",
        evidence: ["Fixture Doc"],
      },
    ],
    education: [{ institution: "Fixture University", degree: "BSc" }],
    certifications: [{ name: "Fixture Cert", issuer: "Fixture Issuer", skills: ["Fixture Skill"] }],
    projects: [
      {
        name: "Fixture Project",
        skills: ["Fixture Skill", "Unknown Skill"],
        technologies: [{ name: "Fixture DB", usageType: "infrastructure" }],
        evidence: ["Fixture Doc"],
      },
    ],
  };
}

function file(name: string, content: string) {
  return { name, bytes: new TextEncoder().encode(content) };
}

async function records(
  ctx: ReturnType<typeof contextFor>,
  jobId: string,
  query: Record<string, string> = {},
) {
  return imports.getJob(
    ctx,
    jobId,
    parseInput(listImportRecordsQuerySchema, { pageSize: "100", ...query }),
  );
}

describe("Import pipeline", () => {
  beforeEach(truncateAll);
  afterAll(() => db.$disconnect());

  it("parses → validates → queues for review; nothing is persisted before acceptance", async () => {
    const ctx = contextFor(await createTestUser("imp"));
    const job = await imports.upload(
      ctx,
      "peos_json",
      null,
      file("seed.json", JSON.stringify(exchangeDocument())),
    );
    expect(job).toMatchObject({
      status: "pending_review",
      recordCount: 9,
      invalidCount: 1,
      parserVersion: "peos-json@1",
    });
    expect(job.fileSha256).toMatch(/^[0-9a-f]{64}$/);

    const queue = await records(ctx, job.id);
    const invalid = queue.data.find((r) => r.validationStatus === "invalid");
    expect(invalid).toMatchObject({ entityType: "skill", label: "Bad Skill" });
    expect(invalid?.validationErrors[0]?.path).toBe("targetLevel");
    expect(queue.data.find((r) => r.entityType === "experience")?.payload.startDate).toBe(
      "2021-03-01",
    );

    expect(await db.skill.count()).toBe(0);
    expect(await db.project.count()).toBe(0);
    expect(await db.profile.count()).toBe(0);
  });

  it("accept_new persists in dependency order, links relationships by name and records provenance", async () => {
    const user = await createTestUser("imp");
    const ctx = contextFor(user);
    const job = await imports.upload(
      ctx,
      "peos_json",
      null,
      file("seed.json", JSON.stringify(exchangeDocument())),
    );
    const result = await imports.resolve(ctx, job.id, "accept_new");
    expect(result).toEqual({ accepted: 8, rejected: 0, skipped: 1 });

    const project = await db.project.findFirstOrThrow({
      where: { userId: user.id },
      include: {
        skills: true,
        technologies: true,
        evidence: true,
        importRecord: { include: { job: true } },
      },
    });
    expect(project.origin).toBe("import");
    expect(project.skills).toHaveLength(1);
    expect(project.technologies[0]?.usageType).toBe("infrastructure");
    expect(project.evidence).toHaveLength(1);
    expect(project.importRecord).toMatchObject({
      reviewStatus: "accepted",
      decision: "create",
      confidence: "high",
      reviewedById: user.id,
      job: { fileName: "seed.json", source: "peos_json", parserVersion: "peos-json@1" },
    });
    expect(project.importRecord?.errorMessage).toContain("Unknown Skill");

    const skill = await db.skill.findFirstOrThrow({
      where: { userId: user.id },
      include: { evidence: true, certifications: true },
    });
    expect(skill.evidence[0]?.strength).toBe("strong");
    expect(skill.certifications).toHaveLength(1);
    expect(await db.experienceEvidence.count()).toBe(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe(
      "Fixture Person",
    );

    const stillPending = await records(ctx, job.id, { reviewStatus: "pending" });
    expect(stillPending.data.map((r) => r.label)).toEqual(["Bad Skill"]);
    await expect(
      imports.decide(ctx, job.id, stillPending.data[0]!.id, { action: "accept" }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await imports.decide(ctx, job.id, stillPending.data[0]!.id, { action: "reject" });
    expect((await records(ctx, job.id)).job).toMatchObject({ status: "completed", pending: 0 });

    const audits = await db.auditLog.findMany({ where: { actorId: user.id } });
    expect(audits.filter((a) => a.action === "import_record.accepted")).toHaveLength(8);
    expect(audits.some((a) => a.action === "import_job.uploaded")).toBe(true);
    expect(audits.some((a) => a.action === "import_record.rejected")).toBe(true);
  });

  it("duplicates are never overwritten silently: diff, recommendation, explicit update", async () => {
    const ctx = contextFor(await createTestUser("dup"));
    const existing = await createSkillService(db).create(
      ctx,
      parseInput(createSkillSchema, { name: "Fixture Skill", category: "Old category" }),
    );
    const doc = {
      format: "peos.exchange",
      version: 1,
      skills: [{ name: "fixture skill", category: "New category" }],
    };
    const job = await imports.upload(ctx, "peos_json", null, file("dup.json", JSON.stringify(doc)));
    const [record] = (await records(ctx, job.id)).data;
    expect(record).toMatchObject({ match: "duplicate", matchedEntityId: existing.id });
    expect(record?.comparison).toEqual({
      recommendation: "update",
      differences: expect.arrayContaining([
        { field: "category", existing: "Old category", imported: "New category" },
      ]),
    });

    expect((await imports.resolve(ctx, job.id, "accept_new")).accepted).toBe(0);
    await expect(
      imports.decide(ctx, job.id, record!.id, { action: "accept" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      imports.decide(ctx, job.id, record!.id, { action: "accept", mode: "create" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await imports.decide(ctx, job.id, record!.id, { action: "accept", mode: "update" });
    const updated = await db.skill.findUniqueOrThrow({ where: { id: existing.id } });
    expect(updated).toMatchObject({
      category: "New category",
      origin: "manual",
      importRecordId: record!.id,
    });
    await expect(
      imports.decide(ctx, job.id, record!.id, { action: "reject" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("CSV and LinkedIn files map into the same review queue", async () => {
    const ctx = contextFor(await createTestUser("csv"));
    const csv = [
      "name,description,status,startDate,skills,technologies",
      '"Fixture, Inc. Site",Built it,production,2024-02,Testing | Other,Fixture DB:core',
      ",missing name,idea,,,",
    ].join("\n");
    const csvJob = await imports.upload(ctx, "csv", "project", file("projects.csv", csv));
    const csvRecords = (await records(ctx, csvJob.id)).data;
    expect(csvRecords[0]?.payload).toMatchObject({
      name: "Fixture, Inc. Site",
      startDate: "2024-02-01",
      skills: ["Testing", "Other"],
      technologies: [{ name: "Fixture DB", usageType: "core" }],
    });
    expect(csvRecords[1]?.validationStatus).toBe("invalid");

    const linkedin = [
      "Company Name,Title,Description,Location,Started On,Finished On",
      "Fixture Org,Senior Engineer,Did things,Remote,Jan 2022,",
      "Fixture Org,Engineer,,Remote,Jun 2019,Dec 2021",
    ].join("\r\n");
    const liJob = await imports.upload(ctx, "linkedin_csv", null, file("Positions.csv", linkedin));
    expect(liJob).toMatchObject({ entityHint: "experience", parserVersion: "linkedin-csv@1" });
    const li = (await records(ctx, liJob.id)).data;
    expect(li.map((r) => r.confidence)).toEqual(["medium", "medium"]);
    expect(li[1]?.payload).toMatchObject({ startDate: "2019-06-01", endDate: "2021-12-01" });
  });

  it("rejects malformed files without creating a job", async () => {
    const ctx = contextFor(await createTestUser("bad"));
    for (const [source, content] of [
      ["peos_json", "{not json"],
      ["peos_json", JSON.stringify({ format: "other", version: 1 })],
      ["csv", 'name\n"unterminated'],
      ["linkedin_csv", "Unrelated,Header\n1,2"],
    ] as const) {
      await expect(
        imports.upload(ctx, source, source === "csv" ? "skill" : null, file("f", content)),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    }
    await expect(
      imports.upload(ctx, "peos_json", null, {
        name: "bin.json",
        bytes: new Uint8Array([0xff, 0xfe, 0x00]),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await db.importJob.count()).toBe(0);
  });

  it("another user's import job and records are not reachable", async () => {
    const alice = contextFor(await createTestUser("alice"));
    const bob = contextFor(await createTestUser("bob"));
    const job = await imports.upload(
      alice,
      "peos_json",
      null,
      file("a.json", JSON.stringify(exchangeDocument())),
    );
    const recordId = (await records(alice, job.id)).data[0]!.id;
    await expect(records(bob, job.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(imports.decide(bob, job.id, recordId, { action: "accept" })).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );
    await expect(imports.resolve(bob, job.id, "accept_new")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await imports.listJobs(bob, { page: 1, pageSize: 20 })).page.total).toBe(0);
  });
});

describe("Export", () => {
  beforeEach(truncateAll);

  it("exports only the caller's data with relationships and provenance, deterministically", async () => {
    const alice = contextFor(await createTestUser("alice"));
    const bob = contextFor(await createTestUser("bob"));
    await imports.resolve(
      alice,
      (
        await imports.upload(
          alice,
          "peos_json",
          null,
          file("a.json", JSON.stringify(exchangeDocument())),
        )
      ).id,
      "accept_new",
    );
    await createProjectService(db).create(
      bob,
      parseInput(createProjectSchema, { name: "Bob Secret Project" }),
    );

    const now = new Date("2026-10-02T12:00:00Z");
    const first = await exportsSvc.export(alice, { format: "json" }, now);
    const second = await exportsSvc.export(alice, { format: "json" }, now);
    expect(first.body).toBe(second.body);
    expect(first.body).not.toContain("Bob Secret Project");
    expect(first.fileName).toBe("peos-export-2026-10-02.json");

    const doc = JSON.parse(first.body);
    expect(doc).toMatchObject({ format: "peos.exchange", version: 1 });
    expect(doc.projects[0]).toMatchObject({
      name: "Fixture Project",
      skills: ["Fixture Skill"],
      technologies: [{ name: "Fixture DB", usageType: "infrastructure" }],
      evidence: ["Fixture Doc"],
      provenance: { origin: "import", import: { fileName: "a.json", confidence: "high" } },
    });
    expect(first.body).not.toMatch(/password|session|token/i);

    // Round trip: re-importing the export yields only duplicates (no silent duplication).
    const reimport = await imports.upload(
      alice,
      "peos_json",
      null,
      file("export.json", first.body),
    );
    const queue = (await records(alice, reimport.id)).data;
    expect(queue.every((r) => r.match === "duplicate" && r.validationStatus === "valid")).toBe(
      true,
    );
    expect(
      queue
        .filter((r) => r.entityType !== "profile")
        .every((r) => r.comparison?.recommendation === "reject"),
    ).toBe(true);
  });

  it("CSV export neutralises spreadsheet formulas", async () => {
    const ctx = contextFor(await createTestUser("csv"));
    await createSkillService(db).create(
      ctx,
      parseInput(createSkillSchema, { name: '=HYPERLINK("x")', category: "+cat" }),
    );
    const csv = await exportsSvc.export(ctx, { format: "csv", entity: "skills" });
    expect(csv.contentType).toContain("text/csv");
    expect(csv.body).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv.body).toContain("'+cat");
  });
});

describe("Search", () => {
  beforeEach(truncateAll);

  it("is user-scoped, escapes wildcards and paginates", async () => {
    const alice = contextFor(await createTestUser("alice"));
    const bob = contextFor(await createTestUser("bob"));
    const skills = createSkillService(db);
    for (const name of ["Rust", "Rust async", "100% coverage", "a_b"]) {
      await skills.create(alice, parseInput(createSkillSchema, { name }));
    }
    await skills.create(bob, parseInput(createSkillSchema, { name: "Rust (Bob)" }));
    const search = createSearchService(db);

    const grouped = await search.search(alice, parseInput(searchQuerySchema, { q: "rust" }));
    expect(grouped).toMatchObject({ mode: "grouped", data: [{ type: "skill", total: 2 }] });
    expect(JSON.stringify(grouped)).not.toContain("Bob");

    const percent = await search.search(alice, parseInput(searchQuerySchema, { q: "%" }));
    expect(percent.data).toEqual([expect.objectContaining({ total: 1 })]);
    const underscore = await search.search(
      alice,
      parseInput(searchQuerySchema, { q: "_", type: "skill" }),
    );
    expect(underscore).toMatchObject({ mode: "type", page: { total: 1 } });

    const page = await search.search(
      alice,
      parseInput(searchQuerySchema, { q: "r", type: "skill", pageSize: "1", page: "2" }),
    );
    expect(page).toMatchObject({ mode: "type", page: { page: 2, pageSize: 1, total: 3 } });
  });
});
