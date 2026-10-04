# ADR 0057 — Premium UX: owner-scoped client-side recently-viewed and saved views

**Status:** Accepted · 2026-10-04 · Phase 11

## Context

Phase 11 is UX polish, not new domain functionality. Two cross-cutting conveniences were missing: a
**recently-viewed** jump-back list (surfaced in the command palette) and **saved views** (named
filter/sort snapshots) on list surfaces. Both are per-user preferences, not domain records, and the
phase gate forbids speculative backend/architecture changes ("no unnecessary backend complexity").

The question: where does this state live? A server model (owner-scoped rows + API) would sync across
devices but adds schema, endpoints, audit and authorization surface for what is UI convenience. The
spec calls both "owner-scoped" and "privacy-safe".

## Decision

Keep recently-viewed and saved views **client-side, in `localStorage`, namespaced per owner** — no new
tables, endpoints or server state.

1. **Owner namespace.** `OwnerScopeProvider` (wrapping the app shell) derives a short, stable,
   non-secret token from the signed-in account (`user.email`) via a local FNV hash and exposes it with
   `useOwnerScope()`. All UX storage keys are prefixed with this token, so one account's history and
   views never appear for another account on a shared browser. The token is never transmitted and is
   **not** an authorization boundary — server-side owner isolation (unchanged) remains the only one.

2. **Pure, tested stores.** `src/lib/ux/recently-viewed.ts` and `saved-views.ts` are pure modules
   (reducers + storage read/write) with no React, unit-tested in isolation: dedup, bounding
   (10 recents / 20 views), name validation, scope isolation and resilience to missing/malformed
   storage. React binding lives in `src/lib/ux/hooks.ts`.

3. **Recently-viewed** is recorded by a tiny `RecordRecentView` component dropped into detail views
   once the entity has loaded (projects, skills, certifications, evidence, opportunities). It is a
   bounded convenience, not analytics: no timestamps leave the browser, the list is capped, and it is
   surfaced only as a jump-back group in the command palette.

4. **Saved views** are a named snapshot of a list surface's URL query (filters/sort/search), stored per
   owner + surface. Applying one rewrites the URL params, so views stay shareable and the back button
   keeps working. Integrated once into the shared `ResourceList`, so every list surface gains them.

5. **Command palette** gains a "Recently viewed" group (empty query) and real "Create …" actions that
   deep-link to a list with `?new=1`, which `ResourceList` reads to auto-open its create dialog — every
   command performs a real action.

6. **Accessibility fixes to shared primitives** (surfaced by running axe with the palette/dialogs open
   under WCAG 2.2 AA): the shared Dialog close button now has a ≥24px hit target (`target-size`), and
   the cmdk `CommandSeparator` is marked decorative (`aria-hidden`) so a `role="separator"` is no
   longer an illegal child of the `role="listbox"` (`aria-required-children`). Both fixes apply
   product-wide.

## Consequences

Recents and saved views ship with zero backend surface, zero new authorization paths, and no risk to
owner isolation. The documented trade-off is that they are **per-device** (not synced across browsers)
and cleared with site data — acceptable for UI conveniences; a future phase may promote saved views to
server storage if cross-device sync is wanted. The shared-primitive a11y fixes improve every dialog and
the palette. See [[0056-evidence-vault-and-opportunities]], [[0019-metric-catalogue-and-result-contract]].
