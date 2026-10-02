# Feature Catalog

## 1. Command Center

### 1.1 Executive Snapshot

A dense but readable overview of professional and engineering health.

Widgets: - KPI cards - Priority queue - Project health - Skill gaps -
Recent evidence - Recent decisions - AI insights - Upcoming milestones

### 1.2 Daily Brief

AI-generated daily brief: - What changed - What matters - What is
blocked - What deserves attention - Recommended next actions

Every recommendation must include: - rationale - source entities -
confidence - timestamp

------------------------------------------------------------------------

## 2. Career Intelligence

### Career Graph

Visualize career dimensions: - Engineering depth - Architecture - AI -
Backend - Cloud - DevOps - Security - Robotics - Leadership - Product -
Business impact

The exact categories must be configurable.

### Skill Gap Analysis

For each skill: - Current evidence level - Target level - Gap - Recent
activity - Production evidence - Learning evidence - Project evidence -
Recommended action

Never represent an inferred score as objective truth. Label it as an
analytical estimate.

### Career Evidence

Convert work into evidence: - Problem solved - Scope - Technical
complexity - Ownership - Outcome - Metrics - Links - Screenshots -
Architecture diagrams - Documents

------------------------------------------------------------------------

## 3. Project Intelligence

Project lifecycle:

``` text
Idea → Discovery → Architecture → Development → Validation → Production → Maintenance → Archived
```

Project record: - Name - Description - Problem - Users - Business
value - Status - Health - Start/end dates - Owner - Technologies -
Skills - Architecture - Risks - Milestones - Metrics - Evidence - Links

### Project Health Score

Derived from: - schedule - blockers - scope stability - issue severity -
recent activity - milestone completion

Show component breakdown; never show an unexplained single number.

------------------------------------------------------------------------

## 4. AI Engineering Lab

### Experiment Registry

Each experiment contains: - Hypothesis - Objective - Model - Version -
Prompt - Dataset - Evaluation method - Metrics - Cost - Latency -
Result - Decision - Reproducibility notes

### AI Evaluation

Support: - accuracy - precision/recall where relevant - groundedness -
citation quality - hallucination rate - latency - token usage - cost -
human evaluation

Metrics are extensible and domain-specific.

### Experiment Comparison

Compare runs side-by-side: - model - prompt - dataset - metric deltas -
cost deltas - latency deltas

------------------------------------------------------------------------

## 5. Architecture Intelligence

### ADR Registry

Architecture Decision Records: - Context - Problem - Constraints -
Options - Decision - Consequences - Revisit date - Status - Related
projects

### Architecture Map

Interactive graph: - Services - Databases - Queues - External APIs - AI
models - Infrastructure - Dependencies

Clicking a node opens: - owner - purpose - projects - technology -
incidents - decisions

------------------------------------------------------------------------

## 6. Skills & Knowledge

### Skill Registry

Each skill: - Category - Description - Level model - Target level -
Evidence - Last used - Last demonstrated - Related projects - Related
technologies - Learning path

### Skill Levels

Default: 0 = Not evaluated 1 = Awareness 2 = Working knowledge 3 =
Independent 4 = Advanced 5 = Expert / can lead

Levels must be customizable.

### Knowledge Base

Capture: - Notes - Articles - Books - Courses - Papers - Internal
documents - Architecture notes - Lessons learned

------------------------------------------------------------------------

## 7. Certifications

Certification record: - Name - Issuer - Category - Issue date - Expiry
date - Credential ID - Verification URL - Skills - Related evidence -
Renewal status

Charts: - certifications by domain - certifications timeline - expiring
certifications - skill coverage from certifications

Important: certifications contribute evidence but do not automatically
prove production proficiency.

------------------------------------------------------------------------

## 8. Goals & Roadmap

Goal hierarchy:

``` text
North Star
  └── Annual Objective
       └── Quarterly Goal
            └── Milestone
                 └── Action
```

Each goal has: - Outcome - Metric - Baseline - Target - Deadline -
Confidence - Dependencies - Projects - Skills - Evidence

### Roadmap Views

-   Timeline
-   Quarter board
-   Goal tree
-   Dependency graph
-   Progress chart

------------------------------------------------------------------------

## 9. Engineering Health

Track: - deployments - incidents - bugs - technical debt - test
coverage - build health - lead time - cycle time - change failure rate -
recovery time

All engineering metrics must support: - source - period - definition -
owner - confidence

------------------------------------------------------------------------

## 10. Evidence Vault

Central evidence repository: - certificates - screenshots - architecture
diagrams - GitHub links - project demos - production metrics -
documents - testimonials - publications

Evidence can be linked to: - skill - project - goal - experience -
certification - opportunity

------------------------------------------------------------------------

## 11. Opportunities

Track professional opportunities: - Role - Company - Source - Stage -
Requirements - Required skills - Matching evidence - Notes - Next
action - Date

### Opportunity Fit

Show a transparent matrix:

  Requirement   Evidence   Strength   Missing
  ------------- ---------- ---------- ---------

Do not produce an opaque "you are 87% fit" score without explanation.

------------------------------------------------------------------------

## 12. Analytics

Required analytics pages:

### Career Analytics

-   skill growth
-   project portfolio
-   evidence production
-   learning velocity

### Engineering Analytics

-   delivery
-   reliability
-   quality
-   technical debt

### AI Analytics

-   experiment outcomes
-   model usage
-   cost
-   latency
-   evaluation results

### Portfolio Analytics

-   projects by technology
-   projects by domain
-   production ratio
-   active vs archived
-   impact distribution

------------------------------------------------------------------------

## 13. AI Copilot

Natural language interface over structured data.

Example queries: - "What are my biggest skill gaps?" - "Which projects
demonstrate architecture leadership?" - "What have I shipped this
quarter?" - "Which skills are becoming stale?" - "What should I learn
next based on my active projects?" - "Summarize my last 90 days." -
"Create a portfolio case study from this project."

The copilot must cite records.

------------------------------------------------------------------------

## 14. Search

Global search over: - projects - skills - technologies -
certifications - evidence - ADRs - notes - goals

Support: - fuzzy search - filters - semantic search - recent searches -
keyboard shortcut

------------------------------------------------------------------------

## 15. Notifications

Events: - goal approaching deadline - certification expiry - blocked
project - stale ADR - unresolved critical issue - evidence missing from
major project - planned milestone

Notification center supports: - read/unread - snooze - mute - severity
