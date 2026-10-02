"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "peos.sidebar.collapsed";
const listeners = new Set<() => void>();
// Fallback when localStorage is unavailable (e.g. blocked storage): remembered for this tab only.
let memoryValue = false;

function read(): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? memoryValue : stored === "1";
  } catch {
    return memoryValue;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Desktop sidebar collapsed preference, remembered per browser (falls back to expanded). */
export function useSidebarCollapsed(): [boolean, () => void] {
  const collapsed = useSyncExternalStore(subscribe, read, () => false);

  const toggle = useCallback(() => {
    memoryValue = !read();
    try {
      window.localStorage.setItem(STORAGE_KEY, memoryValue ? "1" : "0");
    } catch {
      // Storage unavailable: keep the in-memory value only.
    }
    listeners.forEach((listener) => listener());
  }, []);

  return [collapsed, toggle];
}
