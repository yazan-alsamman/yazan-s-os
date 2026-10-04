"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useOwnerScope } from "@/components/providers/owner-scope";

import { readRecent, writeRecent, type RecentEntity } from "./recently-viewed";
import { readViews, removeView, upsertView, writeViews, type SavedView } from "./saved-views";

function storage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** Read the owner's recently-viewed list (client-only; empty during SSR/first paint). */
export function useRecentlyViewed(): RecentEntity[] {
  const scope = useOwnerScope();
  const [recent, setRecent] = useState<RecentEntity[]>([]);
  useEffect(() => {
    // Hydrate from browser-only storage after mount (avoids an SSR/client mismatch); the server
    // snapshot is [] and this is the React-sanctioned reason an effect may setState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecent(readRecent(storage(), scope));
  }, [scope]);
  return recent;
}

/**
 * Record a visit to an entity (used on detail pages). Records once per (type,id) mount so repeated
 * renders do not thrash localStorage. A null entry (e.g. while loading) records nothing.
 */
export function useRecordRecentView(entry: Omit<RecentEntity, "at"> | null): void {
  const scope = useOwnerScope();
  const recorded = useRef<string | null>(null);
  const key = entry ? `${entry.type}:${entry.id}` : null;
  useEffect(() => {
    if (!entry || !key || recorded.current === key) return;
    recorded.current = key;
    writeRecent(storage(), scope, { ...entry, at: Date.now() });
  }, [entry, key, scope]);
}

export interface UseSavedViews {
  views: SavedView[];
  save: (name: string, query: string) => void;
  remove: (id: string) => void;
}

/** Owner- and surface-scoped saved views with persistence. */
export function useSavedViews(surface: string): UseSavedViews {
  const scope = useOwnerScope();
  const [views, setViews] = useState<SavedView[]>([]);
  useEffect(() => {
    // Hydrate from browser-only storage after mount (see note in useRecentlyViewed).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setViews(readViews(storage(), scope, surface));
  }, [scope, surface]);

  const save = useCallback(
    (name: string, query: string) => {
      setViews((current) => {
        const next = upsertView(current, { name, query });
        writeViews(storage(), scope, surface, next);
        return next;
      });
    },
    [scope, surface],
  );

  const remove = useCallback(
    (id: string) => {
      setViews((current) => {
        const next = removeView(current, id);
        writeViews(storage(), scope, surface, next);
        return next;
      });
    },
    [scope, surface],
  );

  return { views, save, remove };
}
