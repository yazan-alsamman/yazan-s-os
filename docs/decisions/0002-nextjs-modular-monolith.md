# ADR 0002 — Modular Next.js monolith

**Status:** Accepted · 2026-10-02

## Context

`03_TECHNICAL_ARCHITECTURE.md` §1 says: _"Prefer a modular Next.js backend initially, with clear
boundaries: route handlers / server actions, Zod validation, service layer, repository layer,
domain modules. If scale requires extraction later, modules must be separable without rewriting
the domain."_ An earlier audit prompt mentioned NestJS, but no specification document does.

## Decision

- One Next.js 16 App Router application. Route Handlers serve the JSON API under `/api/v1`, and
  Better Auth owns `/api/auth`.
- Layering: Route Handler → `defineRoute` → auth guard → Zod validation → module service →
  module repository → Prisma.
- Domain modules live in `src/modules/<domain>/`. Cross-cutting infrastructure lives in
  `src/lib/<concern>/`. There are no generic `utils.ts`/`helpers.ts` files.
- Services and repositories are factories with explicit dependencies, so they can be lifted into
  another runtime unchanged.
- UI code cannot import the database layer. This is enforced by ESLint `no-restricted-imports`.
- A module folder is created only when its phase starts. Phase 0 has `account` and `audit`.

## Alternatives considered

- _NestJS backend + Next.js frontend:_ contradicts `03` and adds a second deployable plus an API
  contract to maintain. Rejected.
- _Microservices:_ no scale requirement exists. Rejected.
- _Server Actions as the primary API:_ used where they fit forms later, but a versioned HTTP API
  keeps the domain reachable for future integrations and the Copilot tool layer (`06`).

## Consequences

- One build, one deploy, shared types.
- Module boundaries depend on convention plus lint rules. Reviews must reject cross-module
  repository access.
- Long-running work (analytics, AI, ingestion) runs in separate worker processes via the queue
  (ADR 0006), not inside request handlers.
