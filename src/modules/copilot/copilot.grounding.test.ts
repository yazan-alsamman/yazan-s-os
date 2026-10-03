import { describe, expect, it } from "vitest";

import {
  buildMessages,
  numbersSupported,
  retrievalAnswer,
  validateAnswer,
} from "./copilot.grounding";
import type { Source } from "./copilot.tools";

function source(over: Partial<Source> = {}): Source {
  return {
    ref: "project:1",
    type: "project",
    id: "1",
    label: "Payments platform",
    href: "/projects/1",
    origin: "record",
    fields: { name: "Payments platform", status: "shipped" },
    ...over,
  };
}

const metric = (): Source =>
  source({
    ref: "metric:projects.shipped",
    type: "metric",
    origin: "derived",
    label: "Projects shipped",
    fields: { value: 3, state: "ok" },
  });

describe("numbersSupported", () => {
  it("accepts numbers present in cited fields", () => {
    expect(numbersSupported("You shipped 3 projects.", [metric()])).toBe(true);
  });
  it("accepts a ratio spoken as a percentage", () => {
    expect(numbersSupported("Coverage is 75%.", [source({ fields: { ratio: 0.75 } })])).toBe(true);
  });
  it("rejects numbers that appear nowhere in the sources", () => {
    expect(numbersSupported("You shipped 99 projects.", [metric()])).toBe(false);
  });
});

describe("validateAnswer", () => {
  const sources = [source(), metric()];

  it("keeps statements whose citations were retrieved", () => {
    const raw = JSON.stringify({
      statements: [
        { text: "The Payments platform is shipped.", kind: "fact", sources: ["project:1"] },
      ],
    });
    const result = validateAnswer(raw, sources);
    expect(result?.statements).toHaveLength(1);
    expect(result?.notices).toHaveLength(0);
  });

  it("drops references to records that were not retrieved", () => {
    const raw = JSON.stringify({
      statements: [
        {
          text: "The Payments platform is shipped.",
          kind: "fact",
          sources: ["project:1", "project:999"],
        },
      ],
    });
    const result = validateAnswer(raw, sources);
    expect(result?.statements[0]!.sources).toEqual(["project:1"]);
    expect(result?.notices.join(" ")).toMatch(/not retrieved/);
  });

  it("drops a fact with no supporting source entirely", () => {
    const raw = JSON.stringify({
      statements: [{ text: "You are an expert.", kind: "fact", sources: [] }],
    });
    expect(validateAnswer(raw, sources)).toBeNull();
  });

  it("drops a fact whose number is absent from its cited sources", () => {
    const raw = JSON.stringify({
      statements: [
        { text: "You shipped 42 projects.", kind: "derived", sources: ["metric:projects.shipped"] },
      ],
    });
    const result = validateAnswer(raw, sources);
    expect(result).toBeNull();
  });

  it("relabels a fact that only cites metrics as derived", () => {
    const raw = JSON.stringify({
      statements: [
        { text: "You shipped 3 projects.", kind: "fact", sources: ["metric:projects.shipped"] },
      ],
    });
    const result = validateAnswer(raw, sources);
    expect(result?.statements[0]!.kind).toBe("derived");
  });

  it("keeps analysis and unknown statements without requiring citations", () => {
    const raw = JSON.stringify({
      statements: [
        { text: "This suggests a payments focus.", kind: "analysis", sources: ["project:1"] },
        { text: "Revenue is not recorded.", kind: "unknown", sources: [] },
      ],
    });
    const result = validateAnswer(raw, sources);
    expect(result?.statements).toHaveLength(2);
  });

  it("drops recommendations with no retrieved evidence", () => {
    const raw = JSON.stringify({
      statements: [{ text: "ok", kind: "analysis", sources: [] }],
      recommendations: [
        {
          recommendation: "Do X",
          reasoning: ["because"],
          evidence: ["skill:999"],
          confidence: "high",
          assumptions: [],
        },
      ],
    });
    const result = validateAnswer(raw, sources);
    expect(result?.recommendations).toHaveLength(0);
  });

  it("returns null for non-JSON and for responses that break the contract", () => {
    expect(validateAnswer("not json", sources)).toBeNull();
    expect(validateAnswer(JSON.stringify({ statements: "nope" }), sources)).toBeNull();
  });
});

describe("retrievalAnswer", () => {
  it("builds fully cited statements from tool results", () => {
    const result = retrievalAnswer([
      {
        tool: "searchProjects",
        input: {},
        status: "ok",
        result: { sources: [source()], total: 1, limitation: null },
        error: null,
        durationMs: 1,
      },
    ]);
    expect(result.statements).toHaveLength(1);
    expect(result.statements[0]!.sources).toEqual(["project:1"]);
    expect(result.statements[0]!.kind).toBe("fact");
  });

  it("reports empty results and failures without inventing data", () => {
    const result = retrievalAnswer([
      {
        tool: "searchSkills",
        input: {},
        status: "ok",
        result: { sources: [], total: 0, limitation: null },
        error: null,
        durationMs: 1,
      },
      {
        tool: "getProject",
        input: {},
        status: "failed",
        result: null,
        error: "Record not found",
        durationMs: 1,
      },
    ]);
    expect(result.statements.some((s) => s.kind === "unknown")).toBe(true);
    expect(result.unavailable.join(" ")).toMatch(/not found/);
  });
});

describe("buildMessages", () => {
  it("puts rules in a system turn and retrieved data in a delimited untrusted block", () => {
    const { messages, includedRefs } = buildMessages({
      task: "answer",
      question: "What have I shipped?",
      history: [],
      sources: [source()],
      limitations: [],
    });
    expect(messages[0]!.role).toBe("system");
    expect(messages[1]!.content).toContain("<DATA>");
    expect(messages[1]!.content).toContain("What have I shipped?");
    expect(includedRefs).toEqual(["project:1"]);
  });

  it("drops sources beyond the context budget and says so", () => {
    const many = Array.from({ length: 400 }, (_, i) =>
      source({ ref: `project:${i}`, id: String(i), fields: { name: "x".repeat(200) } }),
    );
    const { includedRefs, dropped } = buildMessages({
      task: "answer",
      question: "q",
      history: [],
      sources: many,
      limitations: [],
    });
    expect(dropped).toBeGreaterThan(0);
    expect(includedRefs.length).toBeLessThan(many.length);
  });
});
