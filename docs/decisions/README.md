# Architecture Decision Records

Format: Context · Decision · Alternatives considered · Consequences · Status.
An accepted ADR is changed only by a new ADR that supersedes it.

| ADR                                                  | Title                                                                  | Status   |
| ---------------------------------------------------- | ---------------------------------------------------------------------- | -------- |
| [0001](0001-repository-isolation.md)                 | Dedicated PEOS Git repository                                          | Accepted |
| [0002](0002-nextjs-modular-monolith.md)              | Modular Next.js monolith (no NestJS, no microservices)                 | Accepted |
| [0003](0003-user-ownership-model.md)                 | Single-user product with enforced per-user ownership                   | Accepted |
| [0004](0004-authentication-better-auth.md)           | Authentication with Better Auth                                        | Accepted |
| [0005](0005-database-and-infrastructure.md)          | PostgreSQL + Prisma 7, Docker-based local infrastructure               | Accepted |
| [0006](0006-queue-bullmq.md)                         | Background jobs with BullMQ on Redis                                   | Accepted |
| [0007](0007-chart-library-echarts.md)                | Apache ECharts as the chart library                                    | Accepted |
| [0008](0008-observability.md)                        | Provider-neutral observability (pino + OpenTelemetry API)              | Accepted |
| [0009](0009-security-headers-csp.md)                 | Nonce-based CSP and baseline security headers                          | Accepted |
| [0010](0010-toolchain-versions.md)                   | Toolchain version pinning                                              | Accepted |
| [0011](0011-core-domain-model.md)                    | Core domain model, relational integrity and provenance                 | Accepted |
| [0012](0012-education-model.md)                      | Education model                                                        | Accepted |
| [0013](0013-skill-level-model.md)                    | Skill level model (default 0–5, no self-assessed level)                | Accepted |
| [0014](0014-import-review-queue.md)                  | Import pipeline, review queue and conflict resolution                  | Accepted |
| [0015](0015-api-conventions.md)                      | API conventions: pagination, sorting, relationships, CSRF, rate limits | Accepted |
| [0016](0016-information-architecture.md)             | Placing Phase 1 records inside the specified navigation                | Accepted |
| [0017](0017-phase1-scope-boundaries.md)              | Phase 1 scope boundaries and deferred entities                         | Accepted |
| [0018](0018-project-lifecycle-groups.md)             | Project lifecycle groups ("active", "production")                      | Accepted |
| [0019](0019-metric-catalogue-and-result-contract.md) | Metric catalogue in code and the metric result contract                | Accepted |
| [0020](0020-dashboard-filters-and-drill-down.md)     | Command Center filters and drill-down                                  | Accepted |
| [0021](0021-activity-feed-and-evidence-timeline.md)  | Recent activity from the audit log; evidence timeline by evidence date | Accepted |
