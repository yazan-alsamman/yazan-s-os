# ADR 0030 — Career graph and the explicit Technology ↔ Skill relationship

**Status:** Accepted · 2026-10-03 · Phase 4 · Completes ADR 0017 (Technology ↔ Skill deferral)

## Context

`08` Phase 4 asks for a career graph. `00` §5 lists Technology → Skills and Skill → Technologies,
and `01` §6 lists "Related technologies" on a skill. ADR 0017 deferred Technology ↔ Skill to
Phase 4 because "it is needed for the career graph". Every node and edge must be traceable to a
real record; Goals, ADRs and AI experiments don't exist yet.

## Decision

1. **`technology_skills (user_id, technology_id, skill_id, created_at)`**, an explicit join
   maintained by the user.
   - Composite FKs to both owners, cascading on delete.
   - PK `(technology_id, skill_id)`, index on `skill_id`.
   - `PUT /api/v1/skills/:id/technologies` replaces the set, audited as `skill.relations_updated`.
   - It is **never inferred** from projects. The dossier separately shows "Technologies used in
     this skill's projects", a real two-hop path labelled as such.
2. **Graph model.** Nodes are skills, projects, technologies, certifications, experiences and
   evidence. Edges are rows of the eight existing owner-scoped joins:
   - `project_skills`, `technology_usages`, `project_evidence`, `skill_evidence`
   - `technology_skills`, `certification_skills`, `certification_evidence`, `experience_evidence`

   No other edge exists.

3. **Bounded, deterministic construction:**
   - **Overview:** seeded with the 20 most-connected active skills (category filter), plus their
     direct neighbours.
   - **Focus:** one record (`focusType`, `focusId`; 404 when it is foreign or missing) plus its
     direct neighbours.
   - **Limits:** neighbours are ranked by link count; at most 150 nodes (default 80).
   - **Edges:** all edges whose both ends are selected, one query per relation. Each neighbour
     query is capped at 2,000 rows.
   - **Ordering:** stable, so responses are deterministic.
   - **Defaults:** skill, project, technology and certification; evidence and experiences are
     opt-in.
4. **Accessible representation.** The ECharts force graph encodes type by **shape** as well as
   colour. Selecting a node opens the record; edge clicks are ignored. A complete list
   alternative accompanies it: each record with its type, connection count and connected names,
   plus an "Open" link and a "Focus" action. The graph is never the only way to explore.

## Alternatives considered

- **Infer Technology ↔ Skill from shared projects.** This fabricates edges the user never
  asserted. Rejected.
- **Unbounded full graph.** This produces an unreadable hairball and unbounded queries.
- **Server-side layout.** It isn't needed; the client force layout is bounded by the node cap.

## Consequences

Goals, ADRs and experiments can join the graph when their phases add real relations. Benchmarks:
overview ~26–38 ms, focus ~16–18 ms at 1,000 projects / 150 skills / 12,000 evidence (after
statistics are current).
