# ADR 0027 — Evidence-derived skill level (`skill-level-v1`)

**Status:** Accepted · 2026-10-03 · Phase 4

## Context

`00` §2.1 says "Evidence over self-assessment": skill scores must be explainable by projects,
production evidence, experiments, certifications, architecture work and outcomes. `08` Phase 4
acceptance requires that every analytical skill insight can be traced to evidence. ADR 0013
deliberately stores no current level.

The repository holds these facts:

| Record               | Fields that can count                                                                |
| -------------------- | ------------------------------------------------------------------------------------ |
| `SkillEvidence`      | `strength` (weak/moderate/strong, set by the user when linking), `date`              |
| `Evidence`           | `type` (incl. `production_metric`, `testimonial`, `publication`), `verified`, `date` |
| `ProjectSkill`       | Joined to `Project.status` and `completedAt`                                         |
| `CertificationSkill` | Joined to `Certification.status`                                                     |
| Experiences          | Linked only through evidence, so they are already counted through that evidence      |

The following do not exist and therefore never count:

- experiments and architecture work (Phases 6 and 7)
- outcomes
- a production flag on evidence beyond `production_metric`
- certification strength

## Decision

**The level is computed on request and never stored.** It is the highest level whose rule, and
every lower rule, holds. The ladder is cumulative.

| Level               | Rule (`any` = one suffices; `all` = every item)                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 Awareness         | **any**: ≥ 1 evidence link · ≥ 1 project link · ≥ 1 certification earned or in progress                                                                            |
| 2 Working knowledge | **any**: ≥ 1 moderate/strong evidence · ≥ 1 linked project in delivery (development, validation, production, maintenance, or completed) · ≥ 1 earned certification |
| 3 Independent       | **all**: ≥ 2 moderate/strong evidence · ≥ 1 of them verified · ≥ 1 linked project in delivery                                                                      |
| 4 Advanced          | **all**: ≥ 3 moderate/strong evidence · ≥ 2 verified · ≥ 1 strong · ≥ 1 production-linked record                                                                   |
| 5 Expert / can lead | **all**: ≥ 5 moderate/strong evidence · ≥ 3 verified · ≥ 2 strong and verified · ≥ 2 production-linked records · ≥ 1 verified testimonial or publication           |

**Production-linked records** = linked projects in production or maintenance (ADR 0018) plus
moderate/strong evidence of type `production_metric`.

**Rationale, in short:**

- Association alone (a project or certification link) caps at 2, so it is never proof of
  expertise. Certifications are never production proficiency.
- "Independent" requires applied, verified work.
- "Advanced" requires production contact.
- "Can lead" requires external recognition, because PEOS records no direct evidence of leading
  others. Testimonials and publications are the closest real signal.

**States:**

- `derived` — a level of 1 or higher.
- `insufficient_evidence` — records exist but none qualifies; for example, only planned or
  revoked certifications are linked.
- `no_evidence` — nothing is linked. The level is `null`, never 0.

**Explanation.** Every requirement is returned with its required and actual counts, plus the
missing requirements of the next level and a one-sentence summary. The dossier renders this as a
table.

**Performance.** Three grouped, parameterised aggregates load all skills' signals: evidence links,
project links and certification links. There is no per-skill query.

## Assumptions (stated in the catalogue and the UI)

- Link strength is the user's statement of how strongly an item demonstrates the skill. It is
  evidence metadata, not a self-assessed level, and it only counts together with real linked
  records.
- An earned certification counts even after it expires (it was demonstrated). Expiry is reported
  by the certification features.
- Each `SkillEvidence` link counts once. Evidence linked only to a project, but not to the skill,
  does not count for the skill.

## Alternatives considered

- **Weighted point score mapped to levels.** This is opaque and gives false precision. Rejected.
- **Recency-weighted level.** This would conflate capability with freshness. Recency is a
  separate signal (ADR 0028).
- **Persisted level cache.** It isn't needed: the dossier takes about 25 ms at 150 skills and
  12,000 evidence links. A cache could only be stale.

## Consequences

Any change to the rules is a new model version (`skill-level-v2`) with a new ADR. Unit tests
cover every level boundary, the cap rules, determinism and the explanation output.
