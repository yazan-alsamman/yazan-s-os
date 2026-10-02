# Data Model

## Core Tables

### User

-   id
-   email
-   name
-   timezone
-   locale
-   createdAt
-   updatedAt

### Profile

-   id
-   userId
-   headline
-   summary
-   location
-   website
-   professionalObjective

### Experience

-   id
-   profileId
-   organization
-   title
-   startDate
-   endDate
-   description
-   achievements
-   evidenceLinks

### Project

-   id
-   name
-   slug
-   description
-   problem
-   solution
-   status
-   healthStatus
-   startDate
-   targetDate
-   completedAt
-   impact
-   repositoryUrl
-   demoUrl
-   productionUrl

### Skill

-   id
-   name
-   category
-   description
-   levelModel
-   targetLevel
-   active

### SkillEvidence

-   id
-   skillId
-   evidenceId
-   strength
-   date

### Technology

-   id
-   name
-   category
-   version
-   notes

### Certification

-   id
-   name
-   issuer
-   issueDate
-   expiryDate
-   credentialId
-   verificationUrl
-   status

### Goal

-   id
-   parentId
-   title
-   type
-   description
-   baseline
-   target
-   metric
-   deadline
-   status
-   confidence

### Milestone

-   id
-   goalId
-   projectId
-   title
-   dueDate
-   completedAt
-   status

### Evidence

-   id
-   type
-   title
-   description
-   sourceUrl
-   fileUrl
-   date
-   verified
-   provenance

### ArchitectureDecision

-   id
-   projectId
-   title
-   context
-   problem
-   decision
-   consequences
-   status
-   revisitDate

### ArchitectureAlternative

-   id
-   decisionId
-   name
-   pros
-   cons
-   rejectedReason

### AIExperiment

-   id
-   projectId
-   title
-   hypothesis
-   objective
-   model
-   modelVersion
-   promptVersion
-   dataset
-   status
-   result
-   decision
-   cost
-   latency

### ExperimentMetric

-   id
-   experimentId
-   name
-   value
-   unit
-   higherIsBetter

### Task

-   id
-   projectId
-   goalId
-   title
-   status
-   priority
-   dueDate
-   completedAt

### LearningItem

-   id
-   title
-   type
-   provider
-   url
-   status
-   startedAt
-   completedAt
-   notes

### TechnologyUsage

Join: - projectId - technologyId - usageType - proficiencyEvidence

------------------------------------------------------------------------

## Relationships

``` text
Project N:M Skill
Project N:M Technology
Project N:M Goal
Project N:M Evidence

Skill N:M Evidence
Skill N:M LearningItem
Skill N:M Project

Goal 1:N Milestone
Goal 1:N Task
Project 1:N ADR
Project 1:N AIExperiment

Certification N:M Skill
Certification N:M Evidence
```

------------------------------------------------------------------------

## Data Integrity

Use: - foreign keys - unique constraints - check constraints - enums
where stable - soft delete only where auditability requires it

Avoid polymorphic relationships unless there is a strong reason.

------------------------------------------------------------------------

## Audit

AuditLog: - id - actorId - action - entityType - entityId - before -
after - createdAt - requestId

Never store secrets in audit payloads.
