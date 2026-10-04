# Phase 11 — Premium UX / Polish — Report

**Date:** 2026-10-04 · **Phase:** 11 · **Status:** ACCEPTED WITH CONDITIONS
**Principle:** _Polish must improve comprehension, navigation and consistency — never decoration or fabricated data._

---

## 1. Executive summary

PEOS already shipped a mature, coherent UX through Phases 1–10: a design-token system with
light/dark/system themes, an app shell (collapsible sidebar, mobile bottom nav + drawer, sticky
header), a `cmdk` command palette with owner-scoped server search, a shared `ResourceList` (URL-driven
search/filter/sort/pagination, responsive table→cards, loading/empty/error states), a shared detail
framework (progressive disclosure, provenance panels), governed KPI/chart components with table
alternatives, and an established axe-based E2E accessibility harness. Phase 11 therefore focused on the
**genuinely missing cross-cutting UX** plus **accessibility hardening**, rather than re-skinning working
screens:

- **Recently viewed** — owner-scoped, bounded jump-back list, surfaced in the command palette.
- **Saved views** — named filter/sort snapshots on every list surface (via shared `ResourceList`).
- **Command palette polish** — a "Recently viewed" group and real "Create …" actions (deep-link +
  auto-open create dialog).
- **WCAG 2.2 AA fixes to shared primitives** found by running axe with the palette/dialogs open:
  Dialog close-button hit target ≥24px (`target-size`), and `CommandSeparator` made decorative
  (`aria-required-children`). Both apply product-wide.

No domain logic, API contract or database schema changed. No fake data was introduced.

## 2. Existing-state assessment

Inspected before coding: design tokens (`:root` semantic colors + dark overrides), `next-themes`
provider + appearance panel, `app-shell`/`sidebar`/`mobile-bottom-nav`, `command-palette` (Ctrl/Cmd+K,
server search, navigate, preferences), `ui/*` primitives (button, dialog, sheet, dropdown, command,
skeleton, tooltip, badge), `data/states` (loading/empty/error), `data/resource-list` and `data/detail`
frameworks, chart components with table fallbacks, and the `tests/e2e` axe harness. Conclusion: most of
sections 5–27 of the brief were already satisfied; the real gaps were recently-viewed and saved
filters, plus latent dialog/palette a11y never previously axe-tested in an open state.

## 3. Phase 11 scope (delivered)

Recently viewed · saved views · command-palette create + recents · shared-primitive a11y fixes · tests ·
ADR · report. Everything else was verified as pre-existing (see acceptance matrix) or deferred.

## 4. Design-system changes

No token changes were required. Shared-primitive refinements: Dialog close button enlarged to a 28px
target with a hover surface; `CommandSeparator` marked `aria-hidden`/`role="presentation"`. These are
consistency/accessibility fixes, not visual redesigns.

## 5. Navigation / shell changes

`OwnerScopeProvider` now wraps the shell to namespace per-user client state. The header, sidebar,
mobile nav, sticky header, skip-link, active-route label and theme/user menus were already in place and
left intact.

## 6. Command palette

What existed: Ctrl/Cmd+K palette with grouped server search, Navigate and Preferences groups, and
planned-section awareness. Changed: added a **Recently viewed** group (shown on empty query, from the
owner's local list) and a **Create** group whose items (`Create project/evidence/opportunity`,
`Add skill/technology`, `Create certification`) deep-link to the list with `?new=1`; `ResourceList`
reads that and auto-opens its create dialog, so every command performs a real action. Why: brief §7.
Validated: `phase11` E2E opens the palette by keyboard, asserts the recents group + a created project
appear, runs a Create command and asserts the create dialog opens; axe clean with the palette open.

## 7. Search / discovery

Reused the existing owner-scoped `/api/v1/search` (brief §8 — "do not implement a new search backend").
No change beyond surfacing recents alongside it.

## 8. Saved views

What existed: list state already lived in the URL (shareable). Added: `src/lib/ux/saved-views.ts`
(pure, validated, bounded) + `SavedViewsMenu` integrated into `ResourceList`, giving every list surface
(projects, skills, technologies, certifications, evidence, opportunities, education) a "Views" control
to save the current filter/sort/search as a named view, apply it (rewrites URL params), or delete it.
Owner- and surface-scoped in `localStorage`. Why: brief §11. Validated: `phase11` E2E saves a view,
clears the filter, re-applies the view and asserts the filter is restored; axe clean.

## 9. Recently viewed

New: `src/lib/ux/recently-viewed.ts` (pure, bounded to 10, deduped) + hooks + a `RecordRecentView`
recorder placed in project/skill/certification/evidence/opportunity detail views. Owner-scoped in
`localStorage`; privacy-safe (nothing transmitted; no analytics). Surfaced in the command palette. Why:
brief §10. Validated: E2E (above) + unit tests.

## 10. Table UX

Pre-existing in `ResourceList`: responsive table→cards below `md`, sticky-free accessible tables with
`caption`/`scope`, sort/filter/pagination, hover/focus, full loading/empty/error states, `aria-live`
result count. Verified, not rebuilt (brief §12). Saved views now sit in the table toolbar.

## 11. Form / dialog UX

Pre-existing `EntityFormDialog`/`ConfirmDelete`/`RelationPicker` with focus trap/restore, labelled
fields, destructive-only confirmation. Phase 11 change: the shared Dialog close button now meets the
24px target-size minimum (improves every dialog). Validated: phase1/phase10 dialog E2E still pass.

## 12. Loading / empty / error / partial states

Pre-existing and coherent (`data/states`, GitHub partial-sync banner from Phase 9.7, opportunity
coverage from Phase 10). The command palette has loading ("Searching…") and empty states; saved views
and recents have explicit empty copy. No "Something went wrong" placeholders were introduced.

## 13. Chart UX

Pre-existing `ChartCard`/`EChart` with title, interpretation, source/freshness meta, table
alternative, and empty/insufficient states (Phases 3–10). Not modified (brief §16 — no new chart
library, no decorative charts).

## 14. KPI / metric UX

Pre-existing governed `KpiCard` (label, value, period, definition popover, drill-down, "—" for
unavailable). No vanity metrics added (brief §15/§28).

## 15. Drill-down / progressive disclosure

Pre-existing detail framework (identity → relationships → provenance), extended in Phase 10. Recents
recording was added without changing the hierarchy.

## 16. Accessibility (WCAG 2.2 AA)

Ran axe (`wcag2a/aa`, `wcag21a/aa`, `wcag22aa`) with the **palette open** — a state never previously
tested — and fixed the two real violations found: `target-size` (Dialog close) and
`aria-required-children` (CommandSeparator). Automated axe now passes on the command-center, a list, the
open palette, and (from prior phases, re-run) evidence/opportunities/GitHub surfaces. Keyboard paths
verified in E2E (Ctrl+K to open, Escape to close, keyboard select of a create command and a saved
view). **Manual screen-reader testing was not performed** in this environment (condition).

## 17. Responsive UX

Pre-existing responsive system (sidebar/drawer/bottom-nav, table→cards, `max-w` main, no-overflow
mobile — covered by phase1 mobile E2E). New controls (Views dropdown, palette groups) reuse responsive
primitives. No new responsive regressions observed; a full device-matrix sweep was not re-run this
phase (condition).

## 18. Performance improvements

Recents/saved-views are O(10/20) localStorage reads behind effects; the palette search remains
debounced and gated at ≥2 chars; `?new` deep-link is handled once then stripped. No measurable new
cost; no speculative perf refactor was done (brief §25/§35). No formal benchmark captured.

## 19. Security preservation

No change to auth, owner isolation, authorization, validation, rate limiting, audit, or safe-URL
handling. The owner-scope token is a non-secret `localStorage` namespace, explicitly **not** an
authorization boundary (ADR 0057); server-side owner isolation is unchanged and still covered by the
integration authz suites. Recents/saved views store only data the user already sees, in their own
browser, namespaced per account — no cross-owner exposure via palette, recents, saved views or caches.

## 20. Tests

- Unit: `src/lib/ux/recently-viewed.test.ts` (7) + `saved-views.test.ts` (8) — dedup, bounding, name
  validation, scope isolation, malformed-data resilience.
- E2E: `tests/e2e/phase11.spec.ts` — command palette (create action + recently-viewed, axe) and saved
  views (persist + re-apply, axe).
- Accessibility: axe asserted on command-center, projects list, open palette (phase11); evidence,
  opportunities, GitHub (phases 9_6–10, re-run).
- Regression: full unit + integration + dialog-heavy E2E re-run (below).

## 21. Exact commands and results

- `npm run lint` → **0 problems**.
- `npm run typecheck` → **0 errors**.
- `npx vitest run --project unit` → **37 files, 329 tests passed** (incl. 15 new UX-store tests).
- `npx vitest run --project integration` → **31 files, 227 tests passed** (no regression).
- `npx playwright test phase1 phase10 phase9_6` (substring also runs phase11) → **17 passed** (dialogs,
  forms, delete-confirm, mobile cards, and all axe checks clean).
- `npm run build` → **success**. `npx prisma validate` → unchanged/valid (no schema change).

## 22. Documentation / ADRs

ADR 0057 (owner-scoped client-side recently-viewed + saved views; palette create actions; shared a11y
fixes) + decisions index updated. This report.

## 23. Known limitations

- Recents and saved views are **per-device** (localStorage), not synced across browsers, and are
  cleared with site data. Documented trade-off (ADR 0057).
- Manual screen-reader testing and a full responsive device-matrix sweep were not performed in this
  environment.
- No formal performance benchmark captured (no measurable new cost introduced).

## 24. Deferred work

- Promoting saved views to server storage for cross-device sync (future phase).
- Per-surface cross-filtering beyond what already exists (brief §17) — existing drill-downs retained;
  no new hidden state added.
- Phase 12 (production hardening) and Phase 13 (continuous intelligence) remain out of scope.

## 25. Acceptance matrix

| Item | Status | Evidence |
|------|--------|----------|
| Design-system consistency | MET | tokens pre-existing; shared-primitive fixes only |
| Premium visual quality | MET | coherent shell/tokens/dark mode (Phases 1–10), verified |
| Navigation consistency | MET | shell/sidebar/mobile nav/active state pre-existing, intact |
| Command palette | MET | Ctrl+K, search, navigate, **create**, **recents**, prefs; E2E + axe |
| Global discovery | MET | existing owner-scoped `/api/v1/search` reused |
| Saved filters | MET | `saved-views` + `SavedViewsMenu` in `ResourceList`; unit + E2E |
| Recently viewed | MET | `recently-viewed` + recorder + palette group; unit + E2E |
| Table UX | MET | `ResourceList` responsive table/cards, a11y, states (verified) |
| Form UX | MET | `EntityFormDialog` (focus trap/restore, labels) (verified) |
| Dialog UX | MET | shared Dialog + close-button target-size fix; E2E |
| Loading states | MET | skeletons across surfaces (verified) |
| Empty states | MET | explicit copy incl. new recents/views (verified) |
| Error states | MET | `ErrorState` + retry (verified) |
| Partial states | MET | GitHub partial-sync banner, opportunity coverage (verified) |
| Chart accessibility | MET | `ChartCard` table alternatives + aria labels (verified) |
| KPI drill-down | MET | `KpiCard` with definition + drill-down (verified) |
| Progressive disclosure | MET | detail framework (verified) |
| Keyboard navigation | MET | palette/dialog/table keyboard paths; E2E |
| WCAG 2.2 AA | PARTIAL | automated axe clean incl. new fixes; manual SR testing not done |
| Responsive behavior | PARTIAL | system pre-existing + phase1 mobile E2E; full device matrix not re-swept |
| Dark/light/system themes | MET | `next-themes` + appearance panel + palette theme actions (verified) |
| Performance / perceived | PARTIAL | no new cost; debounced search; no formal benchmark captured |
| Phase 10 regression safety | MET | phase10 E2E + integration all pass |
| Security preservation | MET | no auth/isolation/API/schema change; authz suites pass; ADR 0057 |
| Tests | MET | unit 329, integration 227, E2E 17, new UX unit + E2E |
| Documentation | MET | ADR 0057 + this report |

## 26. Final status

**PHASE 11 — ACCEPTED WITH CONDITIONS.** The missing premium-UX capabilities (recently viewed, saved
views, palette create/recents) are implemented, tested and accessible; two real shared-primitive WCAG
2.2 AA issues were fixed. Conditions: manual screen-reader testing, a full responsive device-matrix
sweep, and a formal performance benchmark were not performed in this environment, and recents/saved
views are per-device by design. See [[0057-premium-ux-client-state]].
