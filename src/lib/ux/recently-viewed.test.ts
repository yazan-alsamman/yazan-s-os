import { describe, expect, it } from "vitest";

import {
  addRecent,
  clearRecent,
  readRecent,
  RECENT_LIMIT,
  recentKey,
  writeRecent,
  type RecentEntity,
} from "./recently-viewed";

const e = (id: string, type = "project", at = 1): RecentEntity => ({
  type,
  id,
  title: `Title ${id}`,
  href: `/${type}/${id}`,
  at,
});

/** A minimal in-memory Storage for the pure read/write helpers. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  } satisfies Storage;
}

describe("addRecent", () => {
  it("puts the newest entry first", () => {
    const list = addRecent([e("a")], e("b"));
    expect(list.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("de-duplicates by (type,id), moving it to the front and keeping the new data", () => {
    const list = addRecent([e("a"), e("b")], e("a", "project", 99));
    expect(list.map((x) => x.id)).toEqual(["a", "b"]);
    expect(list[0]!.at).toBe(99);
  });

  it("treats the same id under a different type as distinct", () => {
    const list = addRecent([e("a", "project")], e("a", "skill"));
    expect(list).toHaveLength(2);
  });

  it("caps the list at RECENT_LIMIT", () => {
    let list: RecentEntity[] = [];
    for (let i = 0; i < RECENT_LIMIT + 5; i++) list = addRecent(list, e(`id-${i}`));
    expect(list).toHaveLength(RECENT_LIMIT);
    expect(list[0]!.id).toBe(`id-${RECENT_LIMIT + 4}`); // most recent
  });
});

describe("storage round-trip", () => {
  it("writes, reads and clears under an owner-scoped key", () => {
    const storage = memoryStorage();
    writeRecent(storage, "scopeA", e("a"));
    writeRecent(storage, "scopeA", e("b"));
    expect(readRecent(storage, "scopeA").map((x) => x.id)).toEqual(["b", "a"]);
    expect(storage.getItem(recentKey("scopeA"))).toBeTruthy();
    clearRecent(storage, "scopeA");
    expect(readRecent(storage, "scopeA")).toEqual([]);
  });

  it("isolates scopes (no cross-owner leakage)", () => {
    const storage = memoryStorage();
    writeRecent(storage, "scopeA", e("a"));
    expect(readRecent(storage, "scopeB")).toEqual([]);
  });

  it("is resilient to missing storage and malformed data", () => {
    expect(readRecent(undefined, "s")).toEqual([]);
    const storage = memoryStorage();
    storage.setItem(recentKey("s"), "not json");
    expect(readRecent(storage, "s")).toEqual([]);
    storage.setItem(recentKey("s"), JSON.stringify([{ bad: true }, e("ok")]));
    expect(readRecent(storage, "s").map((x) => x.id)).toEqual(["ok"]);
  });
});
