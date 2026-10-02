# ADR 0012 — Education model

**Status:** Accepted · 2026-10-02 · Phase 1

## Context

`00` §5 lists _Profile → Education_, and `11` lists _Education_ as an importable category, but
`04_DATA_MODEL.md` defines no Education table (gap C5).

## Decision

`education` table, owned by `user_id`, with these fields:

- `institution` (required)
- `degree`
- `field_of_study`
- `start_date` and `end_date` (both optional, ordered by CHECK)
- `description`
- `achievements text[]`
- provenance (`origin`, `import_record_id`)

Field names mirror Experience. `field_of_study` matches the common CV/LinkedIn vocabulary.

- **Dates are optional** because CVs and LinkedIn exports frequently omit them. Experience keeps a
  required start date, as `04` implies.
- **No Education ↔ Evidence relationship in Phase 1.** `01` §10 lists the entities evidence links
  to (skill, project, goal, experience, certification, opportunity), and education is not among
  them. Adding it later is one join table.
- **No detail page.** The record has no relationships, so the list (with edit and delete) shows
  everything.

## Consequences

Education is searchable, importable (PEOS JSON, CSV, LinkedIn `Education.csv`), exportable and
audited like the other entities.
