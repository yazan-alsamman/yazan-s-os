# Phase 10 — Evidence Vault & Opportunities — Report

**Date:** 2026-10-04 · **Phase:** 10 · **Status:** ACCEPTED WITH CONDITIONS
**Principle:** _Evidence over self-assessment · transparent fit, never an opaque score · no fabricated evidence._

---

## 1. Executive summary

Phase 10 completes the Evidence Vault & Opportunities area. The Evidence Vault already existed (a
first-class, owner-scoped, provenance-bearing entity linked to projects, skills, certifications,
experiences, AI experiments and architecture decisions since Phase 1), so this phase **built the
missing pieces around it**:

- an **Opportunity** tracker (roles, consulting, freelance, speaking, partnerships) with lifecycle,
  priority, deadline, source and notes;
- **structured requirements** per opportunity (kind, importance required/preferred, optional concrete
  link to an owned skill/technology/certification);
- **explicit evidence-to-requirement mapping** and a **transparent fit matrix** (Requirement ·
  Evidence · Strength · Missing) with decomposable coverage — never an opaque fit score;
- **grounded evidence suggestions** from a requirement's linked record (never inferred from free text);
- **controlled GitHub → Evidence** linking that reuses the Phase 9.x projections and keeps provenance;
- an **exportable evidence portfolio** per opportunity (on-screen, print/PDF, Markdown download);
- the Evidence detail now shows the opportunities/requirements an item supports and a GitHub badge.

The Opportunities section is now a live top-level area.

## 2. Existing-state / recovery analysis

No prior Phase 10 work existed (the `/opportunities` nav entry was `planned`). Preserved unchanged:
the entire Evidence module (model, repository, service, routes, Vault list/detail UI), the Phase 9.x
GitHub integration and projections, auth, authorization, audit, the metric-result/provenance
conventions and the design system. The only edits to existing code were additive: the Evidence model
(GitHub provenance columns + a requirement back-relation), the Evidence detail DTO/UI (opportunity
links + GitHub badge), `AuditEntity` (two new entities), the records UI kit (opportunity list + form
fields/options), navigation (opportunities → available) and its test.

## 3. Data model

Migration `20261004140337_opportunities_and_evidence_matching` (additive; dev + test DBs; `prisma
validate` passes):

- **Opportunity** — `title, organization?, type, status, priority, description?, source?, sourceUrl?,
location?, deadline?, nextAction?, notes?, origin, importRecordId?`; indexes `(userId,status)`,
  `(userId,type)`, `(userId,deadline)`; `@@unique([id,userId])`.
- **OpportunityRequirement** — `opportunityId, kind, label, description?, importance, skillId?,
technologyId?, certificationId?`; composite FK to Opportunity `(id,userId)`; single-column
  `SetNull` FKs to skill/technology/certification; indexes on `opportunityId`, `(userId,kind)` and
  each concrete id; `@@unique([id,userId])`.
- **RequirementEvidence** — `(requirementId, evidenceId)` PK; composite FKs to requirement and
  evidence `(id,userId)`; index on `evidenceId`.
- **Evidence** (modified) — added nullable `githubResourceType`, `githubResourceId`, and the
  `requirementLinks` back-relation. New enums: `OpportunityType`, `OpportunityStatus`,
  `OpportunityPriority`, `RequirementImportance`, `RequirementKind`.

## 4. Evidence architecture

Unchanged lifecycle (`verified` + `verifiedAt`, origin manual|import, provenance from the import
record). Two additions: GitHub-derived evidence is distinguishable (non-null `githubResourceType`,
unverified by default), and evidence now exposes the opportunity requirements it is mapped to for
two-way navigation (Evidence ⇄ Requirement ⇄ Opportunity).

## 5. Opportunity architecture

An opportunity owns an ordered set of requirements (required first). A requirement's `kind` may carry
one concrete link (skill/technology/certification) used purely to suggest supporting evidence. All
writes are transactional and audited (`opportunity`, `opportunity_requirement`).

## 6. Matching architecture

`opportunity.matching.ts` (pure, unit-tested): per requirement — `supported` (≥1 **verified** mapped
evidence), `partial` (mapped but unverified), `unsupported` (none); strength mirrors status. Coverage
= supported required ÷ total required (null with no required requirements), **always** shown with the
supported/partial/missing breakdown for required and preferred. The service adds grounded
`suggestions`: evidence tied to the requirement's concrete skill/certification, or to projects using
its technology, not yet mapped. Matching never reads free text and never invents a match.

## 7. GitHub integration

`POST /api/v1/evidence/from-github` (service `github-evidence.service.ts`) reads ONE owner-synchronized
resource from the Phase 9.x projections (`IntegrationExternalResource` repo, `GitHubPullRequest`,
`GitHubIssue`, `GitHubRelease`, `GitHubCommit`) and creates one citing evidence record, unverified,
with provenance. A resource the owner has not synchronized is "not found"; no GitHub rows are
duplicated. UI entry points: the repository detail page and each pull-request row ("Save as evidence").

## 8. APIs (all owner-scoped via `defineUserRoute`, audited)

- `GET/POST /api/v1/opportunities`; `GET/PATCH/DELETE /api/v1/opportunities/[id]`
- `GET /api/v1/opportunities/[id]/fit`
- `POST /api/v1/opportunities/[id]/requirements`; `PATCH/DELETE …/requirements/[reqId]`
- `PUT /api/v1/opportunities/[id]/requirements/[reqId]/evidence`
- `POST /api/v1/evidence/from-github`

## 9. UI (new routes/components)

- `/opportunities` — list (search, stage/type/priority filters, create) via the shared `ResourceList`.
- `/opportunities/[id]` — dossier: header + edit/delete, coverage panel, the requirements & evidence
  fit matrix (add/edit/delete requirement, map evidence, grounded suggestions, link concrete record),
  provenance.
- `/opportunities/[id]/portfolio` — print/PDF + Markdown export of real evidence.
- Evidence detail extended (opportunities panel + GitHub badge); GitHub "Save as evidence" buttons.
- Every surface has loading, empty, error and not-found states; the design system is reused.

## 10. Analytics / metrics

The opportunity fit is surfaced as transparent, decomposable counts (not a governed catalogue metric,
by design — the spec forbids a single fit score). No decorative charts were added. Existing analytics
(including evidence production) are unchanged.

## 11. Security

Owner isolation is enforced server-side on every opportunity, requirement, mapping and fit, and on
GitHub-derived evidence. Integration test `opportunities.int.test.ts` verifies: cross-owner get/update/
delete/fit → NOT_FOUND; a cross-owner list is empty; linking another owner's skill → VALIDATION_FAILED;
mapping another owner's evidence → VALIDATION_FAILED; linking another owner's or an unsynchronized
GitHub resource → NOT_FOUND. External URLs are validated http(s) and rendered through the safe link
component; GitHub text is escaped React text.

## 12. Accessibility

Automated axe (`expectNoAxeViolations`) passes on the opportunities list, the opportunity dossier
(with coverage + fit matrix), the portfolio, and the Evidence Vault (Phase 10 E2E). Forms use the
existing accessible `EntityFormDialog`/`RelationPicker`; status and strength are always conveyed by
text (badges), never colour alone; tables use `scope`/`caption`. **Manual screen-reader testing was
not performed** (condition for final acceptance).

## 13. Performance

Fit aggregates from local projections; list/detail use indexed, owner-scoped queries; requirement
suggestions are batched per requirement and capped (10 each) on a bounded requirement set; no GitHub
calls occur on page load (GitHub evidence reads one projection row on an explicit action). No formal
benchmark was captured this phase.

## 14. Tests — exact commands and results

- `npx vitest run --project unit` → **35 files, 314 tests passed** (incl. `opportunity.matching.test.ts`: 7).
- `npx vitest run --project integration` → **31 files, 227 tests passed** (incl. `opportunities.int.test.ts`: 7 — CRUD, requirement ownership validation, evidence mapping, transparent coverage, grounded suggestions, controlled GitHub→evidence with provenance + not-found, owner isolation).
- `npx playwright test phase10` → **2 passed** (create opportunity → add requirement → "Missing" + 0% coverage → create evidence → map → "Partial" (unverified never "supported") → portfolio → Vault; **axe: no violations** on all four surfaces).
- `npm run lint` → **0**. `npm run typecheck` → **0**. `npm run build` → **success** (all new routes present). `npx prisma validate` → **valid**.

## 15. Limitations / deferred work

- **Implemented:** opportunities, structured requirements, explicit evidence mapping, transparent
  decomposable fit, grounded suggestions, controlled GitHub→evidence, portfolio export, Vault links.
- **Intentionally deferred (Phase 13):** automatic evidence extraction, opportunity intelligence, and
  AI-assisted matching/suggestions beyond a requirement's own concrete link.
- **Out of Phase 10 scope:** object-storage file uploads (evidence files remain external URLs).
- **Condition:** manual screen-reader pass and a formal performance benchmark are outstanding.

## 16. Acceptance matrix

| Requirement                                                  | Status                        | Evidence                                               |
| ------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------ |
| Evidence first-class with provenance & review state          | met (pre-existing, preserved) | `Evidence` model, Vault UI                             |
| Evidence justified relationships + search/filter             | met                           | detail panels incl. opportunities; `/evidence` filters |
| Opportunities persisted with lifecycle & provenance          | met                           | `Opportunity` model; `opportunities.int.test.ts`       |
| Structured requirements with relationships                   | met                           | `OpportunityRequirement` (+ concrete links)            |
| Evidence↔requirement mapping, transparent, no invention      | met                           | `RequirementEvidence`; `getFit`; matching tests        |
| Unsupported requirements visible; inspectable match          | met                           | fit matrix status/strength + evidence list             |
| No opaque fit score                                          | met                           | coverage shown only with full breakdown                |
| Reuse Phase 9.x GitHub; no bulk/auto evidence                | met                           | `github-evidence.service.ts` (one resource, explicit)  |
| GitHub-derived evidence keeps provenance                     | met                           | `githubResourceType/Id` + sourceUrl; integration test  |
| Owner isolation enforced & tested                            | met                           | cross-owner NOT_FOUND/VALIDATION_FAILED tests          |
| External URLs validated; content escaped                     | met                           | `optionalHttpUrl` + safe link component                |
| UX states (loading/empty/error/not-found)                    | met                           | dossier, list, portfolio                               |
| Responsive + design system reused                            | met                           | shared `ResourceList`/detail kit                       |
| Accessibility tested (automated)                             | met                           | Phase 10 axe E2E                                       |
| Exportable portfolio from real data                          | met                           | `/opportunities/[id]/portfolio` + Markdown             |
| Unit / integration / E2E / lint / typecheck / build / prisma | met                           | §14                                                    |
| No fake data                                                 | met                           | empty states; nothing seeded                           |
| Manual screen-reader testing                                 | not done                      | condition                                              |

## 17. Final status

**PHASE 10 — ACCEPTED WITH CONDITIONS.** All in-scope acceptance criteria are met, tested and
automated-accessibility-clean. Conditions: a manual screen-reader pass and a formal performance
benchmark. See [[0056-evidence-vault-and-opportunities]].
