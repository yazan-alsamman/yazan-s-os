# ADR 0007 — Apache ECharts as the chart library

**Status:** Accepted · 2026-10-02 (installation deferred)

## Context

`02` §7 and `03` §1 recommend _"Apache ECharts or Recharts"_. The required chart types include line,
area, bar, stacked bar, **radar, scatter, heatmap, timeline, Sankey, dependency graph and network
graph** (`02` §7). `05` adds a skill radar, a skill-gap heatmap, a portfolio bubble matrix, a
technology heatmap and an architecture network.

## Decision

Use **Apache ECharts** (through a thin React wrapper owned by PEOS) as the only chart library.

## Alternatives considered

- _Recharts:_ idiomatic React with good basic charts, but it has no native heatmap, Sankey, or
  network/graph layouts. Those would need a second library, which `09` ("no dependencies without
  reason") discourages.
- _Both libraries:_ rejected. It doubles the bundle and splits the visual language.

## Consequences

- **Not installed in Phase 0**, because no chart exists yet. It will be installed with the first
  chart (Phase 2 Command Center).
- Every chart must still meet `02` §7 and `00` §6: accessible data-table fallback, date range,
  export, tooltip, legend where needed, and empty/loading/error states. ECharts' `aria` option plus
  a PEOS table fallback component will be built together in Phase 2.
- Theme colours will be read from the semantic CSS tokens, never hard-coded.
