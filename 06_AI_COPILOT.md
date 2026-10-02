# AI Copilot Specification

## Objective

Provide an evidence-grounded professional analyst capable of answering
questions about the user's engineering career and work.

------------------------------------------------------------------------

## Core Capabilities

### 1. Career Analyst

Analyze: - skill gaps - career evidence - project portfolio - recent
activity

### 2. Engineering Analyst

Analyze: - project health - technical debt - delivery - architecture

### 3. AI Research Analyst

Analyze: - experiments - models - evaluation results - cost/latency
tradeoffs

### 4. Portfolio Writer

Generate: - case studies - project summaries - CV bullets - architecture
narratives

Generated writing must be derived from stored evidence.

------------------------------------------------------------------------

## Tool Layer

Tools:

-   searchProjects(filters)
-   getProject(id)
-   searchSkills(filters)
-   getSkill(id)
-   searchEvidence(filters)
-   getCareerMetrics(range)
-   getProjectMetrics(range)
-   getAIExperiments(filters)
-   getGoals(filters)
-   getCertifications(filters)
-   searchTechnologies(filters)
-   getArchitectureDecisions(filters)

------------------------------------------------------------------------

## Grounding Rules

The AI must:

1.  Prefer database facts.
2.  Cite entity names and record IDs internally.
3.  Distinguish facts from analysis.
4.  State when data is incomplete.
5.  Never invent a project, metric, certification or achievement.
6.  Never infer confidential information.
7.  Never treat a certification as proof of production expertise.
8.  Never output an unexplained career score as objective truth.

------------------------------------------------------------------------

## Recommendation Engine

Recommendations should use:

``` text
Goal relevance
+ active project relevance
+ skill gap
+ evidence gap
+ recency
+ expected impact
+ effort
```

Return:

``` json
{
  "recommendation": "...",
  "reasoning": ["..."],
  "evidence": ["project:123", "skill:456"],
  "confidence": "medium",
  "assumptions": ["..."]
}
```

------------------------------------------------------------------------

## AI UX

The copilot should support:

-   inline questions
-   full-screen chat
-   suggested prompts
-   entity references
-   chart generation
-   "show me the evidence"
-   follow-up questions

Example:

> Which skill should I strengthen next?

Response structure:

1.  Data considered
2.  Observed gaps
3.  Relevant active work
4.  Options
5.  Suggested next action
6.  Evidence references

------------------------------------------------------------------------

## AI Safety

-   no unrestricted SQL
-   no arbitrary tool execution
-   no external action without explicit confirmation
-   redact secrets
-   log AI tool calls
-   rate-limit expensive operations
