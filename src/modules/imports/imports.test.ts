import { describe, expect, it } from "vitest";

import { validateCandidate } from "./candidates";
import { CsvError, escapeCsvCell, parseCsv, toCsv } from "./csv";
import { diffAgainst } from "./existing";
import { naturalKey } from "./matching";
import { compact, normalizeDate, splitList } from "./normalize";
import {
  csvRowToPayload,
  ImportFormatError,
  parseEntityCsv,
  parseLinkedInCsv,
  parsePeosJson,
} from "./parsers";

describe("CSV reader/writer", () => {
  it("parses quotes, escaped quotes, embedded commas/newlines, CRLF and a BOM", () => {
    const text = '﻿name,notes\r\n"a, b","He said ""hi""\nnext line"\r\nplain,\r\n';
    expect(parseCsv(text)).toEqual([
      ["name", "notes"],
      ["a, b", 'He said "hi"\nnext line'],
      ["plain", ""],
    ]);
  });

  it("rejects malformed and oversized input", () => {
    expect(() => parseCsv('a,"open')).toThrow(CsvError);
    expect(() => parseCsv('a,b"c"')).toThrow(CsvError);
    expect(() => parseCsv("a\nb\nc", { maxRows: 2 })).toThrow(/rows/);
    expect(() => parseCsv("a,b,c", { maxColumns: 2 })).toThrow(/columns/);
  });

  it("round-trips through toCsv and neutralises formulas", () => {
    const csv = toCsv(
      ["a", "b"],
      [
        { a: "x,y", b: ["p", "q"] },
        { a: "=1+1", b: "@cmd" },
      ],
    );
    expect(parseCsv(csv)).toEqual([
      ["a", "b"],
      ["x,y", "p | q"],
      ["'=1+1", "'@cmd"],
    ]);
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell("-5")).toBe("'-5");
  });
});

describe("normalisation", () => {
  it.each([
    ["2024-03-15", "2024-03-15"],
    ["2024-03", "2024-03-01"],
    ["2024", "2024-01-01"],
    ["Mar 2024", "2024-03-01"],
    ["September 2019", "2019-09-01"],
    ["Mar 5, 2024", "2024-03-05"],
    ["15/03/2024", "15/03/2024"],
    ["", undefined],
  ])("normalizeDate(%j) → %j", (input, expected) => {
    expect(normalizeDate(input)).toBe(expected);
  });

  it("compacts empty values recursively and splits list cells", () => {
    expect(compact({ a: " x ", b: "", c: null, d: [" ", "y"], e: { f: "" } })).toEqual({
      a: "x",
      d: ["y"],
    });
    expect(splitList(" a | b ||c ")).toEqual(["a", "b", "c"]);
    expect(splitList("")).toBeUndefined();
  });
});

describe("parsers", () => {
  it("PEOS JSON: strict top level, per-record candidates with source refs", () => {
    const result = parsePeosJson(
      JSON.stringify({
        format: "peos.exchange",
        version: 1,
        skills: [{ name: "A" }],
        projects: [{ name: "P" }],
      }),
    );
    expect(result.candidates.map((c) => [c.entityType, c.sourceRef])).toEqual([
      ["skill", "skills[0]"],
      ["project", "projects[0]"],
    ]);
    expect(() => parsePeosJson("[]")).toThrow(ImportFormatError);
    expect(() =>
      parsePeosJson(JSON.stringify({ format: "peos.exchange", version: 1, extra: true })),
    ).toThrow(ImportFormatError);
    expect(() => parsePeosJson(JSON.stringify({ format: "peos.exchange", version: 1 }))).toThrow(
      /no records/,
    );
  });

  it("entity CSV: typed cells, lists, technologies with usage type", () => {
    expect(
      csvRowToPayload("project", {
        name: "P",
        technologies: "Postgres:infrastructure | Redis",
        skills: "A|B",
        startDate: "Jan 2024",
      }),
    ).toEqual({
      name: "P",
      technologies: [{ name: "Postgres", usageType: "infrastructure" }, { name: "Redis" }],
      skills: ["A", "B"],
      startDate: "2024-01-01",
    });
    expect(csvRowToPayload("skill", { name: "S", active: "no", targetLevel: "3" })).toEqual({
      name: "S",
      active: false,
      targetLevel: 3,
    });
    expect(() => parseEntityCsv("name\nx", "profile")).toThrow(ImportFormatError);
  });

  it("LinkedIn: recognises files by header, skips preamble lines, maps fields", () => {
    const certs = parseLinkedInCsv(
      "Notes:\nSome preamble\nName,Url,Authority,Started On,Finished On,License Number\nCert,https://x.invalid,Issuer,Jan 2023,,ABC",
    );
    expect(certs.entityHint).toBe("certification");
    expect(certs.candidates[0]?.payload).toEqual({
      name: "Cert",
      issuer: "Issuer",
      verificationUrl: "https://x.invalid",
      issueDate: "2023-01-01",
      credentialId: "ABC",
    });
    const skills = parseLinkedInCsv("Name\nTypeScript\nGo");
    expect(skills.candidates.map((c) => c.payload.name)).toEqual(["TypeScript", "Go"]);
    const profile = parseLinkedInCsv(
      'First Name,Last Name,Headline,Summary,Websites\nAna,Example,Builder,,"[PERSONAL:https://site.invalid]"',
    );
    expect(profile.candidates[0]?.payload).toEqual({
      name: "Ana Example",
      headline: "Builder",
      website: "https://site.invalid",
    });
    expect(() => parseLinkedInCsv("Foo,Bar\n1,2")).toThrow(/Unrecognised LinkedIn file/);
  });
});

describe("candidate validation", () => {
  it("reuses domain rules and separates relationship names", () => {
    const ok = validateCandidate("project", { name: "P", skills: ["A"], status: "production" });
    expect(ok).toMatchObject({ valid: true, relations: { skills: ["A"] } });

    const bad = validateCandidate("project", { name: "P", repositoryUrl: "javascript:alert(1)" });
    expect(bad).toMatchObject({ valid: false, issues: [{ path: "repositoryUrl" }] });

    const forbidden = validateCandidate("skill", {
      name: "S",
      userId: "x",
      origin: "manual",
      id: "y",
    });
    expect(forbidden.valid).toBe(true);
    if (forbidden.valid) expect(forbidden.entity).not.toHaveProperty("userId");
  });

  it("derives natural keys for duplicate detection", () => {
    expect(naturalKey("skill", { name: "  Type  Script " })).toBe("type script");
    expect(naturalKey("project", { name: "My Project!" })).toBe("slug:my-project");
    expect(naturalKey("certification", { name: "A", issuer: "B" })).toBe("a|b");
  });

  it("diffs candidates against existing records, ignoring relationship fields", () => {
    expect(
      diffAgainst(
        { name: "A", category: "New", skills: ["x"], achievements: ["1"] },
        { name: "A", category: "Old", achievements: ["1"] },
      ),
    ).toEqual([{ field: "category", existing: "Old", imported: "New" }]);
  });
});
