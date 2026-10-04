/**
 * Recently-viewed entities (Phase 11, ADR 0057). A small, bounded, per-owner list kept in the
 * browser so a user can jump back to records they just inspected (from the command palette). It is
 * a convenience, never an analytics tracker: no timestamps are sent anywhere, the list is capped,
 * and it is namespaced per owner so it cannot leak across accounts on a shared browser.
 */
export interface RecentEntity {
  type: string;
  id: string;
  title: string;
  href: string;
  /** Epoch ms of the most recent view (local only; used for ordering). */
  at: number;
}

export const RECENT_LIMIT = 10;
const KEY_PREFIX = "peos.recent.";

export function recentKey(scope: string): string {
  return `${KEY_PREFIX}${scope}`;
}

/** Pure reducer: put `entry` at the front, de-duplicated by (type,id), capped at RECENT_LIMIT. */
export function addRecent(list: readonly RecentEntity[], entry: RecentEntity): RecentEntity[] {
  const deduped = list.filter((e) => !(e.type === entry.type && e.id === entry.id));
  return [entry, ...deduped].slice(0, RECENT_LIMIT);
}

function isRecent(value: unknown): value is RecentEntity {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.type === "string" &&
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    typeof v.href === "string" &&
    typeof v.at === "number"
  );
}

export function readRecent(storage: Storage | undefined, scope: string): RecentEntity[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(recentKey(scope));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecent).slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

export function writeRecent(
  storage: Storage | undefined,
  scope: string,
  entry: RecentEntity,
): RecentEntity[] {
  const next = addRecent(readRecent(storage, scope), entry);
  if (storage) {
    try {
      storage.setItem(recentKey(scope), JSON.stringify(next));
    } catch {
      /* quota / private mode — the list is a convenience, so failing is non-fatal */
    }
  }
  return next;
}

export function clearRecent(storage: Storage | undefined, scope: string): void {
  if (!storage) return;
  try {
    storage.removeItem(recentKey(scope));
  } catch {
    /* non-fatal */
  }
}
