import { describe, expect, it } from "vitest";

import { computeFit, requirementStatus } from "./opportunity.matching";

describe("requirementStatus", () => {
  it("is unsupported with no evidence", () => {
    expect(requirementStatus([])).toBe("unsupported");
  });
  it("is partial with only unverified evidence", () => {
    expect(requirementStatus([{ verified: false }, { verified: false }])).toBe("partial");
  });
  it("is supported with at least one verified evidence", () => {
    expect(requirementStatus([{ verified: false }, { verified: true }])).toBe("supported");
  });
});

describe("computeFit", () => {
  it("buckets required and preferred separately and never blends them", () => {
    const fit = computeFit([
      { id: "a", importance: "required", evidence: [{ verified: true }] },
      { id: "b", importance: "required", evidence: [{ verified: false }] },
      { id: "c", importance: "required", evidence: [] },
      { id: "d", importance: "preferred", evidence: [{ verified: true }] },
    ]);
    expect(fit.required).toEqual({ total: 3, supported: 1, partial: 1, unsupported: 1 });
    expect(fit.preferred).toEqual({ total: 1, supported: 1, partial: 0, unsupported: 0 });
  });

  it("coverage counts only verified-supported required requirements, decomposably", () => {
    const fit = computeFit([
      { id: "a", importance: "required", evidence: [{ verified: true }] },
      { id: "b", importance: "required", evidence: [{ verified: false }] }, // partial, not covered
      { id: "c", importance: "required", evidence: [] },
      { id: "d", importance: "required", evidence: [{ verified: true }] },
    ]);
    // 2 of 4 required are supported → 0.5; the partial/unsupported are visible in the buckets.
    expect(fit.requiredCoverage).toBe(0.5);
    expect(fit.required.supported).toBe(2);
    expect(fit.required.partial).toBe(1);
    expect(fit.required.unsupported).toBe(1);
  });

  it("returns null coverage when there are no required requirements (never a fake 100%/0%)", () => {
    const fit = computeFit([{ id: "d", importance: "preferred", evidence: [{ verified: true }] }]);
    expect(fit.requiredCoverage).toBeNull();
  });

  it("exposes per-requirement strength mirroring status and the verified count", () => {
    const fit = computeFit([
      { id: "a", importance: "required", evidence: [{ verified: true }, { verified: false }] },
      { id: "b", importance: "preferred", evidence: [] },
    ]);
    const a = fit.requirements.find((r) => r.id === "a")!;
    const b = fit.requirements.find((r) => r.id === "b")!;
    expect(a).toMatchObject({
      status: "supported",
      strength: "strong",
      evidenceCount: 2,
      verifiedCount: 1,
    });
    expect(b).toMatchObject({
      status: "unsupported",
      strength: "none",
      evidenceCount: 0,
      verifiedCount: 0,
    });
  });
});
