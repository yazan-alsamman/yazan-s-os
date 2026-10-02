# Analytics & Metrics Specification

## Metric Governance

Every metric must define:

-   Name
-   Definition
-   Formula
-   Source
-   Frequency
-   Owner
-   Caveats

------------------------------------------------------------------------

## Career Metrics

### Skill Coverage

Percentage of target skills with recent evidence.

### Evidence Velocity

Verified evidence items per period.

### Skill Freshness

Time since a skill was last demonstrated.

### Production Evidence Ratio

``` text
production-linked evidence / total evidence
```

Use as a descriptive indicator, not a quality judgment.

------------------------------------------------------------------------

## Project Metrics

### Delivery Rate

``` text
completed milestones / planned milestones
```

### Project Activity

Weighted count of meaningful events over time.

### Scope Stability

Change in committed scope during a period.

### Blocked Time

Time projects remain blocked.

------------------------------------------------------------------------

## Engineering Metrics

Support DORA-style concepts where data exists: - deployment frequency -
lead time - change failure rate - time to restore

Do not fabricate metrics when integrations are unavailable.

------------------------------------------------------------------------

## AI Metrics

-   experiments per month
-   successful experiment rate
-   average latency
-   average cost
-   evaluation score
-   regression count
-   reproducibility rate

------------------------------------------------------------------------

## Learning Metrics

-   learning hours
-   completed learning items
-   skill-linked learning
-   learning-to-evidence conversion

------------------------------------------------------------------------

## Goal Metrics

-   on-track goals
-   at-risk goals
-   overdue goals
-   completion rate
-   target attainment

------------------------------------------------------------------------

## Visualization Catalog

### Skill Radar

Purpose: current capability profile.

### Skill Gap Heatmap

Rows = skills. Columns = current evidence, target, freshness, production
evidence.

### Project Portfolio Matrix

X = impact. Y = technical complexity. Bubble size = effort.

### Technology Heatmap

Rows = technologies. Columns = months. Cell = meaningful usage.

### Evidence Timeline

Chronological professional evidence.

### Goal Burndown

Progress toward measurable target.

### Architecture Network

Dependencies and critical components.

### AI Experiment Scatter

X = cost. Y = quality/evaluation. Bubble = latency.

### Learning Funnel

``` text
Started → Completed → Applied → Evidence Created
```

------------------------------------------------------------------------

## Analytics UX

Every chart supports: - date range - comparison period - filters -
export - drill-down - data table - source visibility
