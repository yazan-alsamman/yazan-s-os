# ADR 0059 — Security scanning: secret scanning and SAST in CI

**Status:** Accepted · 2026-10-04 · Phase 12

## Context

CI already ran a dependency audit (`pnpm audit --audit-level high`). Phase 12 requires deterministic,
automated **secret scanning** and **static application security testing (SAST)** without adding
overlapping tools or local-only noise, for a GitHub-hosted repository.

## Decision

1. **Secret scanning: gitleaks** as a dedicated `secret-scan` job in `ci.yml`, checked out with full
   history (`fetch-depth: 0`) so historical commits are covered. A committed `.gitleaks.toml` extends
   the default rule set and allowlists only deterministic test fixtures (ephemeral test OAuth values,
   AWS's documented example key used to test the copilot redactor) — never real secrets. Chosen over a
   bespoke grep because gitleaks is a maintained, deterministic, widely-used scanner that runs with no
   repository secrets.

2. **SAST: CodeQL** (`codeql.yml`, `security-and-quality` query pack, JavaScript/TypeScript) on push,
   PR, and weekly. CodeQL is GitHub-native, requires no runtime infra or extra credentials, surfaces
   results in the repo Security tab, and does not pollute local `eslint` output. Preferred over adding
   `eslint-plugin-security` (which would couple SAST to the lint gate and add triage noise to every
   local run) or a third-party SAST SaaS (unnecessary dependency for a private repo).

3. **Dependency audit stays the third pillar**, with explicit, documented exceptions (see
   [[0058-operational-hardening]]) rather than blanket suppression.

4. **No suppression without justification.** Every allowlist entry and audit exception carries an
   inline comment and a re-evaluation note.

## Consequences

Three complementary, deterministic security gates run in CI (secrets, SAST, dependencies) with no new
runtime dependencies and no local developer friction. CodeQL and gitleaks execute GitHub-side, so
their findings are visible in CI/Security but are not reproducible in this local environment (noted as
such in the Phase 12 report). See [[0058-operational-hardening]].
