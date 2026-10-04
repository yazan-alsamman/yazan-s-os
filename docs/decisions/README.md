# Architecture Decision Records

Format: Context · Decision · Alternatives considered · Consequences · Status.
An accepted ADR is changed only by a new ADR that supersedes it.

| ADR                                                               | Title                                                                                      | Status   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------- |
| [0001](0001-repository-isolation.md)                              | Dedicated PEOS Git repository                                                              | Accepted |
| [0002](0002-nextjs-modular-monolith.md)                           | Modular Next.js monolith (no NestJS, no microservices)                                     | Accepted |
| [0003](0003-user-ownership-model.md)                              | Single-user product with enforced per-user ownership                                       | Accepted |
| [0004](0004-authentication-better-auth.md)                        | Authentication with Better Auth                                                            | Accepted |
| [0005](0005-database-and-infrastructure.md)                       | PostgreSQL + Prisma 7, Docker-based local infrastructure                                   | Accepted |
| [0006](0006-queue-bullmq.md)                                      | Background jobs with BullMQ on Redis                                                       | Accepted |
| [0007](0007-chart-library-echarts.md)                             | Apache ECharts as the chart library                                                        | Accepted |
| [0008](0008-observability.md)                                     | Provider-neutral observability (pino + OpenTelemetry API)                                  | Accepted |
| [0009](0009-security-headers-csp.md)                              | Nonce-based CSP and baseline security headers                                              | Accepted |
| [0010](0010-toolchain-versions.md)                                | Toolchain version pinning                                                                  | Accepted |
| [0011](0011-core-domain-model.md)                                 | Core domain model, relational integrity and provenance                                     | Accepted |
| [0012](0012-education-model.md)                                   | Education model                                                                            | Accepted |
| [0013](0013-skill-level-model.md)                                 | Skill level model (default 0–5, no self-assessed level)                                    | Accepted |
| [0014](0014-import-review-queue.md)                               | Import pipeline, review queue and conflict resolution                                      | Accepted |
| [0015](0015-api-conventions.md)                                   | API conventions: pagination, sorting, relationships, CSRF, rate limits                     | Accepted |
| [0016](0016-information-architecture.md)                          | Placing Phase 1 records inside the specified navigation                                    | Accepted |
| [0017](0017-phase1-scope-boundaries.md)                           | Phase 1 scope boundaries and deferred entities                                             | Accepted |
| [0018](0018-project-lifecycle-groups.md)                          | Project lifecycle groups ("active", "production")                                          | Accepted |
| [0019](0019-metric-catalogue-and-result-contract.md)              | Metric catalogue in code and the metric result contract                                    | Accepted |
| [0020](0020-dashboard-filters-and-drill-down.md)                  | Command Center filters and drill-down                                                      | Accepted |
| [0021](0021-activity-feed-and-evidence-timeline.md)               | Recent activity from the audit log; evidence timeline by evidence date                     | Accepted |
| [0022](0022-milestone-model.md)                                   | Milestone model and lifecycle                                                              | Accepted |
| [0023](0023-manual-vs-computed-health.md)                         | Manual health and computed health are independent signals                                  | Accepted |
| [0024](0024-computed-health-formula-v1.md)                        | Computed health formula v1, delivery rate and missing inputs                               | Accepted |
| [0025](0025-portfolio-analytics-and-dossier.md)                   | Portfolio analytics semantics, technology mapping and the project dossier                  | Accepted |
| [0026](0026-custom-skill-level-models.md)                         | Customisable skill level models                                                            | Accepted |
| [0027](0027-evidence-derived-skill-level.md)                      | Evidence-derived skill level (skill-level-v1)                                              | Accepted |
| [0028](0028-skill-freshness-and-trend.md)                         | Skill freshness (freshness-v1) and demonstration trend (skill-trend-v1)                    | Accepted |
| [0029](0029-skill-gap-analysis.md)                                | Skill gap analysis and critical gaps (gap-analysis-v1)                                     | Accepted |
| [0030](0030-career-graph-and-technology-skill.md)                 | Career graph and the explicit Technology ↔ Skill relationship                              | Accepted |
| [0031](0031-goal-lifecycle-and-hierarchy.md)                      | Goal lifecycle, hierarchy and deletion                                                     | Accepted |
| [0032](0032-goal-relationships.md)                                | Goal relationships: projects, skills, milestones, dependencies, measurements               | Accepted |
| [0033](0033-goal-progress-attainment-and-risk.md)                 | Goal progress, target attainment and risk (manual vs derived)                              | Accepted |
| [0034](0034-goal-analytics-and-drill-down.md)                     | Goal analytics, completion rate and drill-down reconciliation                              | Accepted |
| [0035](0035-roadmap-temporal-semantics.md)                        | Roadmap temporal semantics (UTC days, calendar quarters, windows)                          | Accepted |
| [0036](0036-ai-experiment-domain.md)                              | AI experiment domain boundaries (AI Lab)                                                   | Accepted |
| [0037](0037-experiment-lifecycle-and-runs.md)                     | Experiment lifecycle and runs (experiment-lifecycle-v1)                                    | Accepted |
| [0038](0038-experiment-evaluation-analytics-and-comparison.md)    | Evaluation, comparison, analytics and provenance (comparison-v1)                           | Accepted |
| [0039](0039-reproducibility-model.md)                             | Reproducibility model (reproducibility-v1)                                                 | Accepted |
| [0040](0040-no-execution-no-fabrication.md)                       | No model execution, no fabricated AI results, no secrets                                   | Accepted |
| [0041](0041-architecture-decision-domain.md)                      | Architecture decision record domain                                                        | Accepted |
| [0042](0042-decision-lifecycle-and-supersession.md)               | Decision lifecycle and supersession (decision-lifecycle-v1)                                | Accepted |
| [0043](0043-component-registry-and-architecture-map.md)           | Component registry and architecture map                                                    | Accepted |
| [0044](0044-revisit-staleness-and-documentation-gaps.md)          | Revisit, stale critical decisions and documentation gaps                                   | Accepted |
| [0045](0045-architecture-analytics-and-coverage.md)               | Architecture analytics, project coverage and drill-down                                    | Accepted |
| [0046](0046-copilot-architecture-and-grounding.md)                | Copilot architecture: deterministic routing, controlled tools, grounding                   | Accepted |
| [0047](0047-copilot-tool-layer-and-provider-abstraction.md)       | Copilot tool layer, provider abstraction and retrieval-only mode                           | Accepted |
| [0048](0048-copilot-answer-contract-and-validation.md)            | Copilot answer contract, grounding validation and citations                                | Accepted |
| [0049](0049-copilot-context-construction-and-prompt-injection.md) | Copilot context construction and prompt-injection defence                                  | Accepted |
| [0050](0050-copilot-persistence-api-and-rate-limiting.md)         | Copilot persistence, API surface and rate limiting                                         | Accepted |
| [0051](0051-engineering-analytics.md)                             | Engineering Analytics: cross-domain activity, temporal semantics, unavailable integrations | Accepted |
| [0052](0052-integration-platform.md)                              | Integration platform: connectors, token encryption, external identity                      | Accepted |
| [0053](0053-integration-oauth-and-mcp-boundary.md)                | Integration OAuth flow, mutation confirmation, MCP boundary                                | Accepted |
| [0054](0054-github-repository-intelligence.md)                    | GitHub Repository Intelligence: projection model, sync, metrics                            | Accepted |
| [0055](0055-github-intelligence-expansion.md)                     | GitHub Intelligence Expansion: PRs, issues, releases, contributors, activity, resumable sync | Accepted |
| [0056](0056-evidence-vault-and-opportunities.md)                  | Opportunities, structured requirements, transparent evidence matching                      | Accepted |
| [0057](0057-premium-ux-client-state.md)                           | Premium UX: owner-scoped client-side recently-viewed and saved views                       | Accepted |
