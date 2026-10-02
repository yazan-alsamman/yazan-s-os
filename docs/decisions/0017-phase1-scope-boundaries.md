# ADR 0017 — Phase 1 scope boundaries and deferred entities

**Status:** Accepted · 2026-10-02 · Phase 1

## Context

`04_DATA_MODEL.md` and `01` describe entities beyond Phase 1. `08` Phase 1 lists _profile,
experiences, skills, technologies, certifications, projects, evidence_ with CRUD, search,
relationships and import/export. Education is added by ADR 0012.

## Decision — deferred, with reasons

| Item                                                               | Spec source    | Deferred to                           | Reason                                                                                                                                                            |
| ------------------------------------------------------------------ | -------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LearningItem, Skill↔LearningItem                                   | `04`, `01` §6  | Unscheduled (Knowledge)               | Not in `08` Phase 1. Knowledge has no phase in `08` (gap C4). Building it now would be scope creep.                                                               |
| Goal, Goal hierarchy, Goal↔Project/Skill/Evidence, Milestone, Task | `04`, `01` §8  | Phase 5 (goals); Phase 3 (milestones) | Explicitly later phases. No Phase 1 entity needs a goal for referential integrity, so no placeholder tables are created.                                          |
| Opportunity, Evidence↔Opportunity                                  | `01` §11       | Phase 10                              | Evidence links are join tables, so a future `opportunity_evidence` table adds this cleanly.                                                                       |
| Technology↔Skill                                                   | `00` §5        | Phase 4                               | Not in `04` Relationships. It is needed for the career graph.                                                                                                     |
| Education↔Evidence                                                 | —              | When specified                        | Not listed in `01` §10 (ADR 0012).                                                                                                                                |
| Import categories _Languages_, _Links_, _Publications_             | `11`           | Later                                 | `04` has no Language or Link entity. Publications can be imported today as evidence of type `publication`. Extra links beyond `website` need a ProfileLink model. |
| Website import, CV parsing                                         | `11`           | Later                                 | They need an SSRF-safe fetcher and a diff view, and document parsing, respectively (ADR 0014).                                                                    |
| Custom skill level models, evidence-derived current level          | `01` §6        | Phase 4                               | ADR 0013.                                                                                                                                                         |
| Project health score, milestones, portfolio charts                 | `01` §3        | Phase 3                               | The health status is a manual field until then.                                                                                                                   |
| File uploads for evidence                                          | `01` §10, `07` | Phase 10                              | `fileUrl` is an external URL for now. Upload controls (size, MIME, malware scanning, signed URLs) come with object storage.                                       |

## Consequences

No placeholder tables, fake records or partial UIs exist for deferred domains. The navigation
shows them as "Not available yet" with the phase in which they are planned.
