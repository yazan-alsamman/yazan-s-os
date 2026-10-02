# UX / UI Design Specification

## 1. Design Direction

The product should feel like a fusion of:

-   modern developer tooling
-   executive operating dashboard
-   premium analytics product
-   engineering observability platform

Avoid: - generic SaaS cards everywhere - excessive gradients -
decorative charts - giant empty spaces - dashboard clutter without
hierarchy

------------------------------------------------------------------------

## 2. Visual System

### Layout

Desktop: - left navigation: 260px - main content: fluid - optional right
insight rail

Tablet: - collapsible navigation

Mobile: - bottom navigation for primary areas - sheets/drawers for
detail

### Grid

Use a 12-column responsive grid.

Standard spacing: - 4 - 8 - 12 - 16 - 24 - 32 - 48 - 64

------------------------------------------------------------------------

## 3. Typography

Use a modern UI sans-serif.

Hierarchy: - Display - H1 - H2 - H3 - Body - Caption - Metric

Numbers should use tabular numerals.

------------------------------------------------------------------------

## 4. Color System

Use semantic tokens, not hard-coded colors.

Tokens: - background - surface - elevated surface - text - muted text -
border - accent - success - warning - danger - info

Support: - Light - Dark - System

Do not encode meaning through color alone.

------------------------------------------------------------------------

## 5. Command Center Layout

``` text
┌──────────────────────────────────────────────────────┐
│ Search       Date Range       AI Copilot       User   │
├────────────┬─────────────────────────────────────────┤
│ Navigation │ KPI Strip                              │
│            ├───────────────────┬─────────────────────┤
│            │ Momentum           │ Attention           │
│            ├───────────────────┼─────────────────────┤
│            │ Project Health     │ Skill Gaps          │
│            ├───────────────────┼─────────────────────┤
│            │ Evidence Timeline  │ AI Insights         │
│            └───────────────────┴─────────────────────┤
└────────────┴─────────────────────────────────────────┘
```

------------------------------------------------------------------------

## 6. Interaction Principles

### Drill-down

Every KPI must be clickable.

Example: `12 Active Projects` → project list filtered to active.

### Cross-filtering

Selecting: - a technology filters projects - a skill filters evidence -
a project filters architecture and experiments

### Command palette

Keyboard: - Cmd/Ctrl + K

Commands: - Open project - Create evidence - Add skill - Log
experiment - Create ADR - Ask AI - Search

------------------------------------------------------------------------

## 7. Charts

Recommended chart library: - Apache ECharts or Recharts

Required chart types: - line - area - bar - stacked bar - radar -
scatter - heatmap - timeline - Sankey where justified - dependency
graph - network graph

Every chart must include: - tooltip - legend where needed - accessible
data table fallback - date range - export option

------------------------------------------------------------------------

## 8. UX States

Every screen must implement:

### Loading

Skeletons matching final layout.

### Empty

Explain why empty + next action.

### Error

Human-readable message + retry.

### Partial data

Show available data and a clear freshness warning.

### First-run

Guided setup.

------------------------------------------------------------------------

## 9. Responsive Requirements

No horizontal overflow on normal mobile widths.

Charts: - switch to simplified representations - support horizontal
scrolling only when the data itself requires it - maintain
touch-friendly targets

Tables: - desktop: full table - mobile: card/list representation

------------------------------------------------------------------------

## 10. Accessibility

-   keyboard navigation
-   visible focus
-   semantic headings
-   aria labels
-   reduced motion
-   contrast compliance
-   screen-reader labels for charts
-   accessible table alternative for data visualizations

------------------------------------------------------------------------

## 11. Premium UX Details

Include: - subtle transitions - command palette - keyboard shortcuts -
contextual breadcrumbs - sticky page headers - saved filters - recently
viewed - undo where safe - optimistic UI only when consistency is
preserved - confirmation only for destructive actions
