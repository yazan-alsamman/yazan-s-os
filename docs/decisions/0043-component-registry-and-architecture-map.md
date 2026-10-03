# ADR 0043 — Component registry and architecture map

**Status:** Accepted · 2026-10-03 · Phase 7

## Context

- **`08` Phase 7:** architecture map, component registry, dependency visualization.
- **`01` §5 Architecture Map:** an interactive graph of services, databases, queues, external
  APIs, AI models, infrastructure and dependencies; clicking a node opens owner, purpose,
  projects, technology, incidents and decisions.
- **`05` Architecture Network:** dependencies and critical components. **`10`:** architecture
  graph.

## Decision

1. **`ArchitectureComponent`**: name (unique per owner, case-insensitively), **type** — exactly the
   six node types of 01 §5 (`service`, `database`, `queue`, `external_api`, `ai_model`,
   `infrastructure`) — `purpose`, and **`critical`**, an explicit owner flag (05 "critical
   components"; never inferred from fan-in or anything else).
2. **Links** (all owner-scoped by composite FKs):
   - `component_projects` — 01 node detail "projects";
   - `component_technologies` — 01 node detail "technology", reusing **existing Technology
     records** (no second registry). A link table, so deleting a technology removes only the link
     and Phase 1 deletion is unchanged;
   - `decision_components` — 01 node detail "decisions";
   - `component_dependencies` — "A depends on B", explicit records; never self (DB check). Cycles
     are allowed because real architectures contain them; they are drawn as recorded.
3. **The map** (`GET /api/v1/architecture/map`) draws only persisted components and dependency
   records — no edge is inferred from text, technologies or projects. It is **bounded** (10–150
   nodes, default 100; critical first, then by name, deterministic), includes only edges between
   included nodes, reports `total` and `truncated`, and can be filtered by type or project. The UI
   renders an SVG force graph with a **table alternative** listing every component and what it
   depends on; selecting a node opens the component dossier.
4. **Not modelled:** component "owner" (in a single-user product every record is the user's; an
   organisational owner is undefined) and **incidents** (no incident entity exists). Both are
   recorded as specification gaps.

## Consequences

`architecture.components`, `architecture.components_by_type`, `architecture.critical_components`
and `architecture.components_without_decisions` are catalogued. The map stays fast and truthful
regardless of how many components exist.
