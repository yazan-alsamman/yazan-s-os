# Technical Architecture

## 1. Recommended Stack

### Frontend

-   Next.js
-   TypeScript
-   React
-   Tailwind CSS
-   shadcn/ui
-   TanStack Query
-   React Hook Form
-   Zod
-   ECharts/Recharts

### Backend

Prefer a modular Next.js backend initially, with clear boundaries.

-   Route handlers / server actions
-   Zod validation
-   service layer
-   repository layer
-   domain modules

If scale requires extraction later, modules must be separable without
rewriting the domain.

### Database

-   PostgreSQL
-   Prisma ORM
-   pgvector for semantic search

### Background Jobs

-   Redis + queue system, or managed equivalent
-   scheduled analytics
-   AI jobs
-   document ingestion
-   notifications

### Storage

S3-compatible object storage.

### Authentication

Use a mature authentication provider/library rather than custom password
authentication.

### Observability

-   OpenTelemetry
-   structured logs
-   error tracking
-   performance monitoring

------------------------------------------------------------------------

## 2. Architecture

``` text
Browser
  │
  ▼
Next.js App
  ├── UI
  ├── Server Components
  ├── API / Actions
  │
  ▼
Application Services
  ├── Career
  ├── Projects
  ├── Skills
  ├── AI Lab
  ├── Architecture
  ├── Goals
  ├── Evidence
  └── Analytics
  │
  ├───────────────┬───────────────┐
  ▼               ▼               ▼
PostgreSQL       Object Store    Queue
  │                               │
  └──────────────┬────────────────┘
                 ▼
             AI Services
                 │
                 ▼
           Embeddings / LLM
```

------------------------------------------------------------------------

## 3. Domain Modules

Use module boundaries:

``` text
src/
  app/
  modules/
    profile/
    projects/
    skills/
    technologies/
    certifications/
    evidence/
    goals/
    architecture/
    ai-lab/
    analytics/
    opportunities/
    notifications/
  lib/
    db/
    auth/
    ai/
    storage/
    observability/
    validation/
```

Do not create a giant `utils.ts`.

------------------------------------------------------------------------

## 4. API Principles

-   Version APIs where appropriate.
-   Validate all inputs.
-   Return typed responses.
-   Standardize errors.
-   Never expose database internals.
-   Enforce authorization server-side.

Example error shape:

``` json
{
  "code": "PROJECT_NOT_FOUND",
  "message": "The requested project does not exist.",
  "requestId": "..."
}
```

------------------------------------------------------------------------

## 5. Analytics Architecture

Analytics should not calculate expensive metrics repeatedly in UI
requests.

Use:

``` text
Raw entities
   ↓
Normalized events
   ↓
Metric calculations
   ↓
Materialized analytics views
   ↓
Dashboard
```

Metric definitions must be versioned.

------------------------------------------------------------------------

## 6. Event Model

Track domain events:

-   project.created
-   project.shipped
-   milestone.completed
-   skill.evidence_added
-   certification.added
-   certification.expiring
-   experiment.completed
-   adr.created
-   goal.created
-   goal.completed
-   evidence.created

Events enable historical analytics without fragile inference.

------------------------------------------------------------------------

## 7. AI Architecture

AI must access a controlled tool layer.

``` text
AI Copilot
   ↓
Intent Router
   ↓
Tool Registry
   ├── search_projects
   ├── search_skills
   ├── search_evidence
   ├── get_metrics
   ├── get_goals
   └── get_experiments
   ↓
Structured Results
   ↓
LLM synthesis
   ↓
Cited answer
```

Do not allow the model direct unrestricted SQL access.

------------------------------------------------------------------------

## 8. Deployment

Production environments:

-   local
-   preview
-   staging
-   production

CI/CD: - lint - typecheck - unit tests - integration tests - E2E tests -
migration check - build - security checks

No direct production database edits.
