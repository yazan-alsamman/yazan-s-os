import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors/app-error";
import { parseInput } from "@/lib/validation/parse";

import {
  assertTransition,
  compareRuns,
  EXPERIMENT_STATUSES,
  EXPERIMENT_TRANSITIONS,
  experimentReproducibility,
  experimentTransitionVerb,
  resolveCompletion,
  runReproducibility,
  type RunMeasure,
} from "./experiment.rules";
import { createExperimentSchema, createRunSchema } from "./experiment.schemas";

const NOW = new Date("2026-10-03T12:00:00Z");
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const pathOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? (e.details?.[0]?.path ?? e.code) : "other";
  }
  return null;
};

describe("experiment lifecycle (experiment-lifecycle-v1)", () => {
  it("allows exactly the transition table; same-status is allowed", () => {
    for (const from of EXPERIMENT_STATUSES) {
      expect(() => assertTransition(from, from)).not.toThrow();
      for (const to of EXPERIMENT_STATUSES) {
        const legal = from === to || EXPERIMENT_TRANSITIONS[from].includes(to);
        expect(pathOf(() => assertTransition(from, to)) === null, `${from}->${to}`).toBe(legal);
      }
    }
    // planned cannot jump straight to completed.
    expect(pathOf(() => assertTransition("planned", "completed"))).toBe("status");
  });

  it("completion: today by default, past allowed, future and stray dates rejected, reopen clears", () => {
    expect(
      resolveCompletion({ status: "completed", completedAt: undefined }, NOW).completedAt,
    ).toEqual(d("2026-10-03"));
    expect(
      resolveCompletion({ status: "completed", completedAt: d("2026-09-01") }, NOW).completedAt,
    ).toEqual(d("2026-09-01"));
    expect(
      pathOf(() => resolveCompletion({ status: "completed", completedAt: d("2026-12-01") }, NOW)),
    ).toBe("completedAt");
    expect(
      pathOf(() => resolveCompletion({ status: "active", completedAt: d("2026-09-01") }, NOW)),
    ).toBe("completedAt");
    expect(resolveCompletion({ status: "active", completedAt: null }, NOW).completedAt).toBeNull();
  });

  it("distinguishes completion from success and abandonment in the audit verb", () => {
    expect(experimentTransitionVerb("active", "completed")).toBe("completed");
    expect(experimentTransitionVerb("completed", "active")).toBe("reopened");
    expect(experimentTransitionVerb("active", "abandoned")).toBe("abandoned");
    expect(experimentTransitionVerb("planned", "active")).toBe("updated");
  });
});

describe("reproducibility (reproducibility-v1) — recorded metadata only", () => {
  const full = {
    model: "gpt",
    modelVersion: "1",
    promptVersion: "p1",
    datasetName: "set",
    codeRef: "abc",
  };
  it("classifies a run by metadata completeness, never claiming verified reproduction", () => {
    expect(runReproducibility(full).state).toBe("reproducible");
    expect(runReproducibility({ model: "gpt" }).state).toBe("partial");
    expect(runReproducibility({}).state).toBe("not_reproducible");
    expect(runReproducibility({ model: "  " }).state).toBe("not_reproducible"); // blank ≠ present
    expect(runReproducibility(full).explanation).toMatch(/not a verified reproduction/i);
  });

  it("experiment-level is unknown with no runs, else the best run", () => {
    expect(experimentReproducibility([]).state).toBe("unknown");
    expect(experimentReproducibility([{}, full]).state).toBe("reproducible");
    expect(experimentReproducibility([{}, { model: "gpt" }]).state).toBe("partial");
    expect(experimentReproducibility([{}, {}]).state).toBe("not_reproducible");
  });
});

describe("run comparison (comparison-v1) — no overall winner", () => {
  const measure = (over: Partial<RunMeasure> = {}): RunMeasure => ({
    model: null,
    modelVersion: null,
    provider: null,
    promptVersion: null,
    datasetName: null,
    datasetVersion: null,
    codeRef: null,
    environment: null,
    costUsd: null,
    latencyMs: null,
    tokensInput: null,
    tokensOutput: null,
    ...over,
  });

  it("flags config changes and lower-is-better cost/latency deltas", () => {
    const diff = compareRuns(
      { measure: measure({ model: "a", costUsd: 10, latencyMs: 200 }), metrics: [] },
      { measure: measure({ model: "b", costUsd: 6, latencyMs: 250 }), metrics: [] },
    );
    expect(diff.config.find((c) => c.key === "model")).toMatchObject({ changed: true });
    expect(diff.measures.find((m) => m.key === "cost")).toMatchObject({
      verdict: "improvement",
      delta: -4,
    });
    expect(diff.measures.find((m) => m.key === "latency")).toMatchObject({ verdict: "regression" });
  });

  it("uses each metric's direction; a value missing on either side is incomparable", () => {
    const diff = compareRuns(
      {
        measure: measure(),
        metrics: [
          { name: "accuracy", value: 0.8, unit: null, higherIsBetter: true },
          { name: "cost_note", value: 3, unit: null, higherIsBetter: null },
          { name: "only_a", value: 1, unit: null, higherIsBetter: true },
        ],
      },
      {
        measure: measure(),
        metrics: [
          { name: "accuracy", value: 0.9, unit: null, higherIsBetter: true },
          { name: "cost_note", value: 5, unit: null, higherIsBetter: null },
        ],
      },
    );
    const by = (n: string) => diff.metrics.find((m) => m.name === n)!;
    expect(by("accuracy")).toMatchObject({ verdict: "improvement", delta: expect.closeTo(0.1, 5) });
    expect(by("cost_note").verdict).toBe("no_direction");
    expect(by("only_a").verdict).toBe("incomparable");
    // No field in the diff declares an overall winner.
    expect(Object.keys(diff)).toEqual(["config", "measures", "metrics"]);
  });
});

describe("validation strips ownership and enforces non-negative measures", () => {
  it("experiment input drops injected ids; run rejects negative cost", () => {
    const parsed = parseInput(createExperimentSchema, {
      title: "Fixture",
      userId: "attacker",
      id: "x",
    } as Record<string, unknown>);
    expect("userId" in parsed).toBe(false);
    expect(() => parseInput(createRunSchema, { costUsd: -1 })).toThrow();
    expect(() => parseInput(createRunSchema, { tokensInput: -5 })).toThrow();
  });
});
