# ADR 0014 — Import pipeline, review queue and conflict resolution

**Status:** Accepted · 2026-10-02 · Phase 1

## Context

`00` §9 says _"Imported data must enter a review queue before becoming authoritative."_

`11_DATA_IMPORT_PROFILE.md` requires:

- the pipeline Parser → Normalized Candidate Records → Duplicate Detection → User Review →
  Approve/Edit/Reject → Canonical Database
- provenance fields
- conflict display (_Source A, Source B, Difference, Recommended resolution — the user decides_)
- _"do not silently overwrite"_

The exact conflict model and file formats are not specified.

## Decision

**Sources (Phase 1).** Each source records a parser version.

- **PEOS JSON**: the exchange format, identical to the export (`peos-json@1`).
- **Entity CSV**: one record type per file, columns named after the fields (`peos-csv@1`).
- **LinkedIn export CSVs**: Profile, Positions, Education, Skills, Certifications and Projects,
  recognised by their header row (`linkedin-csv@1`).

Personal-website import and CV parsing are deferred. The website importer needs an SSRF-hardened
fetcher and a diff view; CV parsing needs document parsing. Both are noted in ADR 0017.

**Limits and file handling.**

- Maximum file size 2 MiB; at most 2,000 records per file; CSV limits of 60 columns and 20,000
  characters per cell.
- Files must be UTF-8 text with no NUL bytes, and must have an allowed extension and MIME type.
- Content is parsed, never executed.
- **The original file is not stored.** Only its name, size and SHA-256 are kept.
- A malformed file is rejected with HTTP 400 and **creates no job**.

**Queue model (relational).**

- `import_jobs`: one per file.
- `import_records`: one per candidate. Each holds:
  - `entity_type` and `source_ref` (e.g. `projects[2]`, `row 7`)
  - the **normalised** candidate `payload` (JSONB, because its shape varies by entity type)
  - `validation_status` + `validation_errors`
  - `confidence` (`high` for native formats, `medium` for the best-effort LinkedIn mapping)
  - `match` (`new | duplicate`) + `matched_entity_id`
  - `review_status` (`pending | accepted | rejected`), `decision` (`create | update`),
    `result_entity_id`, `reviewed_at`, `reviewed_by`
  - notes

  The raw source row is not stored.

**Validation.** Candidates are validated with the **same Zod schemas as manual entry**, so an
import cannot bypass a rule. Invalid records stay visible with their errors and cannot be accepted.

**Duplicate detection.** Natural keys per entity:

| Entity            | Natural key                          |
| ----------------- | ------------------------------------ |
| Skill, Technology | normalised name                      |
| Project           | slug                                 |
| Certification     | name + issuer                        |
| Evidence          | title + type                         |
| Experience        | organisation + title + start date    |
| Education         | institution + degree                 |
| Profile           | always a match once a profile exists |

Matching is recomputed **at decision time**, because data may have changed since upload.

**Decisions.**

- New record → **accept** creates it.
- Duplicate → the user must choose **update existing** or **create as new**. Create is refused where
  it would violate uniqueness, such as a skill with the same name.
- **Reject** is always available.
- The review UI shows a field-level diff (existing vs imported) and a **recommendation**: _reject_
  when nothing differs, _update_ otherwise.
- **Bulk "accept all new valid records"** accepts only non-duplicate valid records, in dependency
  order: profile → evidence → skills → technologies → experience → education → certifications →
  projects. A record that conflicts stays pending.
- **Bulk "reject all pending"** rejects everything still pending.

**Relationships in imports.** Relationships are expressed by natural names (portable across
accounts) and resolved against the user's **existing** records when the candidate is accepted.
Unresolved names are reported as notes on the import record. They are **never auto-created**,
because that would create unreviewed records. Updates change scalar fields only and never remove
relationships.

**Persistence.** Each decision is one transaction containing:

- the entity write (origin `import`, `import_record_id`)
- the relationship links
- the import-record update
- audit entries (`import_record.accepted|rejected`, plus the entity's `created|updated`)

## Alternatives considered

- _A candidate table per entity type:_ strongly typed, but eight more tables duplicating the domain
  tables. The JSONB payload is always re-validated by the domain schema, so it is never trusted
  as-is.
- _Field-level merge UI:_ `11` asks for the smallest robust model, and a merge engine is not
  required. "Update existing" applies the imported values the user has just reviewed in the diff.

## Consequences

- Re-importing your own export yields only duplicates with a "reject" recommendation, so there is
  no silent duplication (integration-tested).
- LinkedIn's export format is not formally specified. Header recognition is tested against
  synthetic fixtures and may need updating if LinkedIn changes its files.
