# Claude Code Build Instructions

## Mission

Build the Yazan Personal Engineering OS according to the repository
specification.

Do not treat this as a prototype.

Implement it as a production-quality application with clean
architecture, tests, observability and documentation.

------------------------------------------------------------------------

## Before Coding

Read in order:

1.  `00_MASTER_SPEC.md`
2.  `01_FEATURE_CATALOG.md`
3.  `02_UX_UI_DESIGN.md`
4.  `03_TECHNICAL_ARCHITECTURE.md`
5.  `04_DATA_MODEL.md`
6.  `05_ANALYTICS_METRICS.md`
7.  `06_AI_COPILOT.md`
8.  `07_SECURITY_PRIVACY.md`
9.  `08_IMPLEMENTATION_PHASES.md`
10. `10_ACCEPTANCE_CRITERIA.md`

------------------------------------------------------------------------

## Rules

### Rule 1 --- Inspect before modifying

Understand existing files and conventions before changes.

### Rule 2 --- Small coherent commits

Each phase should be independently reviewable.

### Rule 3 --- No fake functionality

Do not create buttons that do nothing.

### Rule 4 --- No placeholder UI in production paths

If a capability is not implemented, clearly mark it as unavailable.

### Rule 5 --- Type safety

Avoid `any` unless justified.

### Rule 6 --- Validation

Validate client and server inputs.

### Rule 7 --- Tests

Critical business logic requires tests.

### Rule 8 --- Observability

Important background jobs and AI calls must be traceable.

### Rule 9 --- Accessibility

Do not postpone accessibility until the end.

### Rule 10 --- Data integrity

Never derive a metric from ambiguous data silently.

------------------------------------------------------------------------

## Preferred Development Loop

``` text
Read spec
→ inspect repository
→ identify current phase
→ implement domain/data
→ implement service
→ implement UI
→ add tests
→ run lint/typecheck/test
→ review UX states
→ document
→ commit
```

------------------------------------------------------------------------

## Definition of Done for Every Phase

-   Feature works end-to-end.
-   Data model is migrated.
-   Validation exists.
-   Error/loading/empty states exist.
-   Tests pass.
-   No console errors.
-   Responsive behavior works.
-   Accessibility reviewed.
-   README/docs updated.
-   No secrets or hard-coded personal data.

------------------------------------------------------------------------

## Personal Data

Do not hard-code personal profile data.

Create: - import mechanism - seed data format - review workflow

Example: `/data/profile.seed.json`

The user should be able to replace the seed with authoritative profile
information.

------------------------------------------------------------------------

## UI Quality Bar

Before declaring a page complete, verify:

-   visual hierarchy
-   spacing
-   typography
-   chart readability
-   keyboard navigation
-   empty state
-   mobile layout
-   dark mode
-   loading state
-   error state

------------------------------------------------------------------------

## AI Quality Bar

Every AI response should answer:

-   What data did you use?
-   What did you infer?
-   What is uncertain?
-   What should the user inspect?

------------------------------------------------------------------------

## Never

-   invent metrics
-   invent certifications
-   invent work history
-   invent project outcomes
-   expose raw SQL to the model
-   skip migrations
-   bypass authorization
-   add dependencies without reason
-   use chart components without accessible alternatives
