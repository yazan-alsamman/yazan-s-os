import { describe, expect, it } from "vitest";

import {
  normalizeViewName,
  readViews,
  removeView,
  savedViewsKey,
  SAVED_VIEW_LIMIT,
  upsertView,
  writeViews,
  type SavedView,
} from "./saved-views";

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

describe("normalizeViewName", () => {
  it("trims, collapses whitespace and bounds length", () => {
    expect(normalizeViewName("  Active   newest  ")).toBe("Active newest");
    expect(normalizeViewName("x".repeat(200)).length).toBe(60);
  });
});

describe("upsertView", () => {
  it("rejects an empty name", () => {
    expect(() => upsertView([], { name: "   ", query: "a=1" })).toThrow();
  });

  it("adds and sorts by name", () => {
    let list = upsertView([], { name: "Beta", query: "b=1" });
    list = upsertView(list, { name: "Alpha", query: "a=1" });
    expect(list.map((v) => v.name)).toEqual(["Alpha", "Beta"]);
  });

  it("replaces a view with the same (case-insensitive) name rather than duplicating", () => {
    let list = upsertView([], { name: "Active", query: "status=active" });
    list = upsertView(list, { name: "active", query: "status=active&sort=name" });
    expect(list).toHaveLength(1);
    expect(list[0]!.query).toBe("status=active&sort=name");
  });

  it("updates in place by id", () => {
    const first = upsertView([], { name: "Active", query: "a=1" })[0]!;
    const list = upsertView([first], { id: first.id, name: "Active renamed", query: "a=2" });
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(first.id);
    expect(list[0]!.query).toBe("a=2");
  });

  it("caps at SAVED_VIEW_LIMIT", () => {
    let list: SavedView[] = [];
    for (let i = 0; i < SAVED_VIEW_LIMIT + 5; i++) {
      list = upsertView(list, { name: `View ${String(i).padStart(3, "0")}`, query: `i=${i}` });
    }
    expect(list.length).toBe(SAVED_VIEW_LIMIT);
  });
});

describe("removeView + storage", () => {
  it("removes by id and round-trips per owner+surface", () => {
    const storage = memoryStorage();
    const views = upsertView([], { name: "Active", query: "status=active" });
    writeViews(storage, "scopeA", "projects", views);
    expect(readViews(storage, "scopeA", "projects")).toHaveLength(1);
    // Scope/surface isolation.
    expect(readViews(storage, "scopeA", "evidence")).toEqual([]);
    expect(readViews(storage, "scopeB", "projects")).toEqual([]);
    expect(savedViewsKey("scopeA", "projects")).toContain("projects");

    const pruned = removeView(views, views[0]!.id);
    writeViews(storage, "scopeA", "projects", pruned);
    expect(readViews(storage, "scopeA", "projects")).toEqual([]);
  });

  it("is resilient to malformed data", () => {
    const storage = memoryStorage();
    storage.setItem(savedViewsKey("s", "projects"), "{bad");
    expect(readViews(storage, "s", "projects")).toEqual([]);
  });
});
