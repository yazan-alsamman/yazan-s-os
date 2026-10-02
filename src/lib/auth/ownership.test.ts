import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors/app-error";

import { ownedBy, requireResourceOwnership } from "./ownership";

const record = { id: "r1", userId: "user-a" };
const owner = (r: typeof record) => r.userId;

describe("requireResourceOwnership", () => {
  it("returns the resource for its owner", () => {
    expect(requireResourceOwnership(record, "user-a", owner)).toBe(record);
  });

  it("rejects another user's resource as NOT_FOUND (no existence leak)", () => {
    expect(() => requireResourceOwnership(record, "user-b", owner)).toThrowError(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
  });

  it.each([null, undefined])("rejects a missing resource (%s) as NOT_FOUND", (missing) => {
    expect(() => requireResourceOwnership<typeof record>(missing, "user-a", owner)).toThrow(
      AppError,
    );
  });

  it("rejects resources without an owner", () => {
    expect(() =>
      requireResourceOwnership({ actorId: null }, "user-a", (r) => r.actorId),
    ).toThrowError(expect.objectContaining({ code: "NOT_FOUND" }));
  });
});

describe("ownedBy", () => {
  it("builds an owner filter", () => {
    expect(ownedBy("user-a")).toEqual({ userId: "user-a" });
  });

  it("refuses an empty owner id instead of producing an unscoped query", () => {
    expect(() => ownedBy("")).toThrowError(expect.objectContaining({ code: "UNAUTHENTICATED" }));
  });
});
