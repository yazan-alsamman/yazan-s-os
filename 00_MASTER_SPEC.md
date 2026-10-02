# Yazan Personal Engineering OS

## Master Product Specification

**Document status:** Production-grade product specification\
**Target implementation:** Claude Code\
**Product type:** Personal Engineering Intelligence Platform / CTO
Command Center\
**Quality target:** Enterprise-grade UX, architecture, observability,
security and analytics; suitable as the specification for a high-budget
bespoke product.

------------------------------------------------------------------------

## 1. Product Definition

Yazan Personal Engineering OS (PEOS) is a private, intelligent operating
system for managing a senior engineer/architect/CTO career as a
measurable portfolio of:

-   Projects
-   Skills
-   Certifications
-   Technologies
-   Architecture decisions
-   AI experiments
-   Professional evidence
-   Goals
-   Learning
-   Work execution
-   Engineering health
-   Business/CTO metrics
-   Career opportunities

The product is **not a task manager with charts**. Its purpose is to
turn professional activity into structured evidence and decision
support.

### Core question

> What should I build, learn, improve, document, or stop doing
> next---and why?

### Product loop

``` text
Capture → Structure → Measure → Analyze → Decide → Execute → Produce Evidence → Learn
   ↑                                                                  ↓
   └────────────────────────────── feedback loop ────────────────────┘
```

------------------------------------------------------------------------

## 2. Product Principles

1.  **Evidence over self-assessment**
    -   Skill scores must be explainable by projects, production
        evidence, experiments, certifications, architecture work, and
        outcomes.
2.  **Decision support over decoration**
    -   Every chart must answer a question.
3.  **One source of truth**
    -   Projects, skills, technologies, goals and evidence are linked
        entities.
4.  **Progressive disclosure**
    -   The dashboard is simple at first glance and deep on demand.
5.  **Senior-engineer UX**
    -   Dense enough for power users, clean enough to scan in seconds.
6.  **AI is an analyst, not the database**
    -   AI recommendations must cite underlying records and show
        confidence/assumptions.
7.  **No vanity metrics**
    -   Avoid meaningless streaks or gamified points.
8.  **Time-aware**
    -   Show current state, trend, and change over time.
9.  **Auditability**
    -   Important metrics and AI recommendations should be traceable to
        source records.
10. **Private by default**

-   Professional data is sensitive.

------------------------------------------------------------------------

## 3. Primary Navigation

1.  Command Center
2.  Career Intelligence
3.  Projects
4.  Engineering
5.  AI Lab
6.  Skills
7.  Knowledge
8.  Certifications
9.  Architecture
10. Goals & Roadmap
11. Analytics
12. Evidence Vault
13. Opportunities
14. Settings / Integrations
15. AI Copilot

------------------------------------------------------------------------

## 4. Command Center

The home page must answer within 10 seconds:

-   What is important today?
-   What is blocked?
-   What changed?
-   What am I building?
-   What skill gaps matter?
-   What evidence did I create?
-   What needs a decision?

### KPI strip

-   Active Projects
-   Projects Shipped (30/90/365 days)
-   Production Systems
-   Active Goals
-   Skill Coverage
-   Critical Skill Gaps
-   AI Experiments
-   Architecture Decisions
-   Evidence Items
-   Technical Debt Trend

### Priority panels

**Critical** - Blocked project - Overdue milestone - Security issue -
Stale critical decision

**Attention** - Skill gap - Goal at risk - Certification expiring -
Project with declining health

**Momentum** - Recently shipped - Recent production evidence - New skill
evidence - Successful experiment

### Required charts

-   Project delivery trend
-   Skill radar
-   Skill-gap matrix
-   Technology usage heatmap
-   Evidence timeline
-   Learning velocity
-   AI experiment outcome trend
-   Technical debt trend
-   Architecture decision timeline

------------------------------------------------------------------------

## 5. Global Entity Model

The application revolves around these entities:

``` text
Profile
 ├── Experiences
 ├── Education
 ├── Certifications
 ├── Skills
 ├── Technologies
 └── Evidence

Project
 ├── Technologies
 ├── Skills
 ├── Goals
 ├── Architecture Decisions
 ├── AI Experiments
 ├── Milestones
 ├── Tasks
 └── Evidence

Skill
 ├── Evidence
 ├── Projects
 ├── Learning Items
 └── Goals

Technology
 ├── Projects
 ├── Skills
 ├── Learning Items
 └── Evidence

Goal
 ├── Projects
 ├── Skills
 ├── Milestones
 └── Evidence

AI Experiment
 ├── Project
 ├── Model
 ├── Dataset
 ├── Metrics
 └── Result

Architecture Decision
 ├── Project
 ├── Alternatives
 ├── Decision
 ├── Consequences
 └── Evidence
```

------------------------------------------------------------------------

## 6. Dashboard Philosophy

Every visualization must have:

-   Title
-   One-sentence interpretation
-   Date range
-   Filters
-   Data freshness
-   Drill-down behavior
-   Empty state
-   Loading state
-   Error state
-   Accessible alternative

Charts should never exist simply because the dashboard needs to "look
impressive."

------------------------------------------------------------------------

## 7. Non-Functional Requirements

### Performance

-   Initial dashboard LCP target: \< 2.0s on a normal broadband
    connection.
-   Interactive chart response: \< 150ms for locally cached datasets.
-   API p95 target: \< 500ms for standard reads.
-   Background analytics must not block UI rendering.

### Reliability

-   Automated backups.
-   Database migrations.
-   Health checks.
-   Structured logs.
-   Error tracking.
-   Audit log.
-   Recovery procedures.

### Security

-   Strong authentication.
-   Session rotation.
-   RBAC-ready authorization model.
-   Encryption in transit.
-   Secrets never committed.
-   Server-side validation.
-   Rate limiting.
-   CSRF/XSS protection.
-   Secure file handling.
-   Audit events for sensitive actions.

### Accessibility

Target WCAG 2.2 AA.

------------------------------------------------------------------------

## 8. Definition of Done

A feature is not done until:

-   UX states are complete.
-   Mobile/responsive behavior is defined.
-   Accessibility is tested.
-   Server validation exists.
-   Database constraints exist.
-   Error states exist.
-   Analytics events exist where useful.
-   Tests cover critical behavior.
-   Documentation is updated.
-   Empty/demo states are handled.
-   AI-generated content has provenance where applicable.

------------------------------------------------------------------------

## 9. Source-of-Truth Policy

The platform must support importing the professional profile from:

-   Personal website
-   CV/resume
-   LinkedIn export
-   Manual entry
-   JSON/CSV import

Imported data must enter a **review queue** before becoming
authoritative.

Do not hard-code personal facts into application code.
