import { describe, expect, it } from "vitest";

import { findSectionByPath, NAV_SECTIONS } from "./navigation";

/** 00_MASTER_SPEC.md §3 "Primary Navigation", in order. */
const SPEC_NAVIGATION = [
  "Command Center",
  "Career Intelligence",
  "Projects",
  "Engineering",
  "AI Lab",
  "Skills",
  "Knowledge",
  "Certifications",
  "Architecture",
  "Goals & Roadmap",
  "Analytics",
  "Evidence Vault",
  "Opportunities",
  "Settings / Integrations",
  "AI Copilot",
];

describe("navigation registry", () => {
  it("matches the specification's primary navigation exactly", () => {
    expect(NAV_SECTIONS.map((s) => s.label)).toEqual(SPEC_NAVIGATION);
  });

  it("has unique ids and hrefs", () => {
    expect(new Set(NAV_SECTIONS.map((s) => s.id)).size).toBe(NAV_SECTIONS.length);
    expect(new Set(NAV_SECTIONS.map((s) => s.href)).size).toBe(NAV_SECTIONS.length);
  });

  it("puts at most four sections in the mobile bottom bar", () => {
    expect(NAV_SECTIONS.filter((s) => s.mobilePrimary).length).toBeLessThanOrEqual(4);
  });

  it("marks exactly the sections built so far (Phases 0–9) as available", () => {
    expect(NAV_SECTIONS.filter((s) => s.availability === "available").map((s) => s.id)).toEqual([
      "command-center",
      "career",
      "projects",
      "ai-lab",
      "skills",
      "certifications",
      "architecture",
      "goals",
      "analytics",
      "evidence",
      "settings",
      "copilot",
    ]);
  });

  it("resolves nested paths to their section", () => {
    expect(findSectionByPath("/projects/123")?.id).toBe("projects");
    expect(findSectionByPath("/projectsx")).toBeUndefined();
  });
});
