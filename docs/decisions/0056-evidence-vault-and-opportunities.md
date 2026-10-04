# ADR 0056 — Opportunities, structured requirements, and transparent evidence matching

**Status:** Accepted · 2026-10-04 · Phase 10

## Context

Evidence has been a first-class, owner-scoped entity with provenance since Phase 1 (linked to
projects, skills, certifications, experiences, AI experiments and architecture decisions). Phase 10
completes the Evidence Vault & Opportunities area (08 Phase 10; 01 §10–11): an **Opportunity** tracker
with **structured requirements** and a **transparent evidence-to-requirement fit**, an exportable
evidence portfolio, and controlled GitHub-derived evidence — without duplicating the existing evidence
model or the Phase 9.x GitHub projections.

The spec is explicit (01 §11): the fit is a matrix — _Requirement · Evidence · Strength · Missing_ —
and must **never** be an opaque "you are 87% fit" score. Phase 13 owns _automatic_ evidence
extraction and opportunity intelligence, so Phase 10 keeps all evidence creation user-initiated.

## Decision

1. **Reuse Evidence as-is; add Opportunities around it.** No change to the evidence lifecycle. Three
   additive, owner-scoped models (migration `20261004140337_opportunities_and_evidence_matching`):
   - `Opportunity` (title, organization, `type`, `status` stage, `priority`, description, source,
     sourceUrl, location, deadline, nextAction, notes, origin/importRecord for provenance).
   - `OpportunityRequirement` (kind, label, description, importance required|preferred, and an optional
     concrete link to one owned skill/technology/certification).
   - `RequirementEvidence` (explicit map of an owned evidence item to a requirement).
     Composite FKs `(id, userId)` enforce same-owner opportunity↔requirement↔evidence links; the optional
     concrete links are single-column FKs with `SetNull` (a deleted skill never deletes a requirement),
     with same-owner validated in the service.

2. **Matching counts only explicit maps, and is decomposable.** A requirement is `supported` only with
   ≥1 **verified** mapped evidence item, `partial` with mapped-but-unverified evidence, `unsupported`
   with none. Required coverage = supported required ÷ total required (null when there are no required
   requirements) and is always presented **with** the full supported/partial/missing breakdown — never
   as a lone number. Nothing is inferred from free text. (`opportunity.matching.ts`, pure + unit-tested.)

3. **Grounded suggestions, never fabrication.** When a requirement links a concrete
   skill/technology/certification, the fit offers evidence **already** tied to that record (skill/cert
   evidence, or evidence on projects that use the technology) and not yet mapped. Suggestions are
   opt-in; the user maps them explicitly. Kubernetes appearing in a repo never becomes "5 years of
   Kubernetes".

4. **Controlled GitHub → Evidence.** A dedicated action reads ONE chosen, already-synchronized GitHub
   resource (repository, PR, issue, release or commit) from the Phase 9.x projection and creates one
   evidence record citing it, preserving provenance (`githubResourceType` + `githubResourceId` + the
   GitHub URL in `sourceUrl`). It starts **unverified** (pending review) and is visibly
   "GitHub-derived". Never automatic, never bulk; a resource the owner has not synchronized is simply
   not found. No GitHub data is duplicated beyond the citation.

5. **Exportable portfolio from real data.** An opportunity's portfolio view renders its requirements,
   each with its mapped evidence (title, date, verification, source) and the coverage breakdown, and
   offers print/PDF and a Markdown download built client-side from the same fit response. It never
   rewrites facts into claims.

6. **Security & provenance.** Every query is owner-scoped; identity is from the session; injected
   ids/owner ids are "not found"; linking another owner's skill or evidence is rejected as if it does
   not exist. Imported evidence/opportunities keep their import provenance and GitHub-derived evidence
   is distinguishable from verified authoritative evidence (ADR 0014/0019). External URLs are stored
   only as validated http(s) and rendered through the existing safe link component.

7. **Reuse the platform.** Standard `collectionRoutes`/`itemRoutes`/`relationRoute` handlers, the
   `ResourceList`/`EntityFormDialog`/`RelationPicker` UI kit, the metric-result/provenance conventions,
   and the audit log. No parallel frameworks.

## Consequences

PEOS can now connect evidence → requirements → opportunities and answer "what do I have for this
opportunity, and what is missing?" transparently, with an exportable portfolio and controlled GitHub
provenance. Deferred to Phase 13: automatic evidence extraction, opportunity intelligence and
suggestions beyond a requirement's own concrete link. Object-storage uploads remain external URLs
(unchanged from Phase 1). See [[0055-github-intelligence-expansion]],
[[0019-metric-catalogue-and-result-contract]], [[0014-import-review-queue]], [[0011-core-domain-model]].
