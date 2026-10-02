# Import & Export Formats (Phase 1)

Design: ADR 0014. Implementation: `src/modules/imports/*` and `src/modules/exports/*`.

## Pipeline

```text
Upload (≤ 2 MiB, UTF-8, .json/.csv)
  → parse (PEOS JSON | entity CSV | LinkedIn CSV)   → malformed file: HTTP 400, no job
  → normalise (trim, drop empties, dates → YYYY-MM-DD)
  → validate (same Zod schemas as manual entry)       → invalid records stay visible, cannot be accepted
  → duplicate-match (natural keys)
  → review queue (Settings → Import → job)
  → accept (create | update existing) / reject        → one transaction per decision, audited
  → persisted with provenance (origin=import, import_record_id)
```

## PEOS exchange JSON (`peos.exchange` v1)

- **Machine-readable schema:** `data/peos-exchange.schema.json`. It is generated from the
  validators and kept in sync by a unit test.
- **Empty template:** `data/profile.seed.json`. It deliberately contains **no records**. Replace it
  with your own authoritative data and import it through the review queue (spec `09`, `11`).

```json
{
  "format": "peos.exchange",
  "version": 1,
  "profile": { "name": "…", "headline": "…", "website": "https://…" },
  "skills": [
    {
      "name": "…",
      "category": "…",
      "targetLevel": 3,
      "evidence": [{ "title": "…", "strength": "strong" }]
    }
  ],
  "technologies": [{ "name": "…", "version": "…" }],
  "evidence": [
    { "type": "repository", "title": "…", "sourceUrl": "https://…", "date": "2025-01-31" }
  ],
  "experiences": [
    { "organization": "…", "title": "…", "startDate": "2021-03", "evidence": ["<evidence title>"] }
  ],
  "education": [{ "institution": "…", "degree": "…" }],
  "certifications": [{ "name": "…", "issuer": "…", "skills": ["<skill name>"] }],
  "projects": [
    {
      "name": "…",
      "status": "production",
      "skills": ["…"],
      "technologies": [{ "name": "…", "usageType": "infrastructure" }],
      "evidence": ["…"]
    }
  ]
}
```

- Relationships are given **by name** (skills/technologies) or **title** (evidence). They are
  resolved against your existing records when a record is accepted. Names that cannot be resolved
  are reported as notes and never auto-created.
- Export-only fields (`id`, `provenance`, `exportedAt`) are ignored on import. A JSON export is
  therefore re-importable, and re-importing it yields duplicates only.
- Dates accept `YYYY-MM-DD`, `YYYY-MM`, `YYYY`, `Mar 2024` and `Mar 5, 2024`. Ambiguous `15/03/2024`
  is rejected.

## Entity CSV

- One record type per file, chosen in the upload form. Header names are the JSON field names, for
  example:

  ```csv
  name,description,status,startDate,skills,technologies
  ```

- List cells (`achievements`, `skills`, `evidence`) use `|` as the separator.
- Project technologies are written `Name:usageType | Name`.
- Booleans (`active`, `verified`) accept `true/false/yes/no/1/0`.
- Profiles cannot be imported from CSV.
- Limits: 2,000 rows, 60 columns, 20,000 characters per cell.

## LinkedIn data export ("Get a copy of your data")

Upload the individual CSV files; zip archives are not accepted. Files are recognised by their
header row, and leading "Notes:" lines are skipped. Mapping is best-effort, so confidence is
`medium`.

| File                 | Maps to       | Columns used                                                                                                                     |
| -------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `Profile.csv`        | profile       | First/Last Name → name, Headline, Summary, Geo Location → location, first URL in Websites → website                              |
| `Positions.csv`      | experience    | Company Name, Title, Description, Started On, Finished On                                                                        |
| `Education.csv`      | education     | School Name, Degree Name, Field Of Study (if present), Start/End Date, Notes + Activities → description                          |
| `Certifications.csv` | certification | Name, Authority → issuer, Url → verificationUrl, Started On → issueDate, Finished On → expiryDate, License Number → credentialId |
| `Projects.csv`       | project       | Title, Description, Url (repository if GitHub/GitLab/Bitbucket, else demo), Started On, Finished On → completedAt                |
| `Skills.csv`         | skill         | Name                                                                                                                             |

## Export

- `GET /api/v1/export?format=json` returns the full exchange document. It includes relationships by
  name and the provenance of every record.
- `GET /api/v1/export?format=csv&entity=projects|skills|…` returns one table, with columns matching
  the entity CSV importer plus `id` and `origin`.
- Security:
  - Only the caller's records are exported.
  - The file is generated on request and never stored; there are no public URLs.
  - Responses use `Content-Disposition: attachment` and `no-store`.
  - CSV cells starting with `= + - @` (or tab/CR) are prefixed with `'` to neutralise spreadsheet
    formulas.
  - Each export writes an `export.generated` audit entry.
  - Exports are limited to 30 per hour.
