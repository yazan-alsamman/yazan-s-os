/**
 * Saved views (Phase 11, ADR 0057). A named snapshot of a list surface's filter/sort/search state,
 * stored per owner + surface in the browser. Applying a view rewrites the URL params, so views stay
 * shareable and the back button keeps working. Owner-namespaced (no cross-account leakage on a
 * shared browser), bounded, and validated. Not synced across devices — a documented limitation.
 */
export interface SavedView {
  id: string;
  name: string;
  /** The surface's query string, e.g. "status=active&sort=name". No leading "?". */
  query: string;
}

export const SAVED_VIEW_LIMIT = 20;
export const SAVED_VIEW_NAME_MAX = 60;
const KEY_PREFIX = "peos.views.";

export function savedViewsKey(scope: string, surface: string): string {
  return `${KEY_PREFIX}${scope}.${surface}`;
}

export function normalizeViewName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, SAVED_VIEW_NAME_MAX);
}

/** Validate and (idempotently, by case-insensitive name) upsert a view; throws on an empty name. */
export function upsertView(
  list: readonly SavedView[],
  input: { name: string; query: string; id?: string },
): SavedView[] {
  const name = normalizeViewName(input.name);
  if (!name) throw new Error("A saved view needs a name.");
  const id = input.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const view: SavedView = { id, name, query: input.query };
  const withoutMatch = list.filter(
    (v) => v.id !== id && v.name.toLowerCase() !== name.toLowerCase(),
  );
  return [...withoutMatch, view]
    .slice(-SAVED_VIEW_LIMIT)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function removeView(list: readonly SavedView[], id: string): SavedView[] {
  return list.filter((v) => v.id !== id);
}

function isView(value: unknown): value is SavedView {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.name === "string" && typeof v.query === "string";
}

export function readViews(
  storage: Storage | undefined,
  scope: string,
  surface: string,
): SavedView[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(savedViewsKey(scope, surface));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isView).slice(0, SAVED_VIEW_LIMIT) : [];
  } catch {
    return [];
  }
}

export function writeViews(
  storage: Storage | undefined,
  scope: string,
  surface: string,
  views: readonly SavedView[],
): void {
  if (!storage) return;
  try {
    storage.setItem(
      savedViewsKey(scope, surface),
      JSON.stringify(views.slice(0, SAVED_VIEW_LIMIT)),
    );
  } catch {
    /* non-fatal */
  }
}
