"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Owner scope for per-user client-side UX state (Phase 11, ADR 0057). Recently-viewed and saved
 * views live in the browser (localStorage), so their keys are namespaced by a stable, non-secret
 * per-owner token derived from the signed-in account. This keeps one person's history and saved
 * views from ever appearing for another account on a shared browser. It is never sent anywhere and
 * is not an authorization boundary — server-side owner isolation remains the only one.
 */
const OwnerScopeContext = createContext<string>("anon");

/** A short, stable, non-reversible-enough token for a localStorage namespace (not a secret). */
function tokenFor(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function OwnerScopeProvider({ seed, children }: { seed: string; children: ReactNode }) {
  return (
    <OwnerScopeContext.Provider value={tokenFor(seed || "anon")}>
      {children}
    </OwnerScopeContext.Provider>
  );
}

/** The current owner's namespace token for client-side UX storage keys. */
export function useOwnerScope(): string {
  return useContext(OwnerScopeContext);
}
