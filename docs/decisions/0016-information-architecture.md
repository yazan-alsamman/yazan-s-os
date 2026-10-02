# ADR 0016 — Placing Phase 1 records inside the specified navigation

**Status:** Accepted · 2026-10-02 · Phase 1

## Context

`00` §3 fixes 15 primary navigation items. Several Phase 1 pages are not primary items: Profile,
Experience, Education, Technologies, Import and Export. Adding new top-level items would change
the specified navigation.

## Decision

Keep the 15 primary items exactly (unit-tested). Place the Phase 1 pages as secondary tabs under
the closest specified section:

| Primary item            | Tabs / pages                     | Rationale                                                                                 |
| ----------------------- | -------------------------------- | ----------------------------------------------------------------------------------------- |
| Career Intelligence     | Profile · Experience · Education | `00` §5: Profile → Experiences, Education; career analysis (Phase 4) will sit beside them |
| Projects                | list · detail                    | —                                                                                         |
| Skills                  | Skills · Technologies            | `01` §6 "Skills & Knowledge"; technologies are the most closely related record type       |
| Certifications          | list · detail                    | —                                                                                         |
| Evidence Vault          | list · detail                    | `01` §10; Phase 10 adds uploads and portfolio export                                      |
| Settings / Integrations | Account · Import · Export        | data import/export is account-level data management, next to future integrations          |

The sections become `available`. Their summaries state what is live now and what arrives later
(for example, "Career analysis arrives in Phase 4"). The command palette adds direct "Go to"
commands for every secondary page.

## Consequences

If a later specification adds dedicated navigation for these pages, only the registry and the tab
layouts change.
