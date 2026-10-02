# ADR 0010 — Toolchain version pinning

**Status:** Accepted · 2026-10-02

## Context

The Phase 0 instructions fix Node.js 24.x and pnpm 11.x. Several packages' npm `latest` tags,
checked 2026-10-02, point to versions that are prereleases or not yet supported by the rest of the
toolchain.

## Decision

| Tool         | Chosen                                      | Not chosen                 | Reason                                                                                         |
| ------------ | ------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| Node.js      | 24.x (`.nvmrc`, `engines`, `engine-strict`) | —                          | Required                                                                                       |
| pnpm         | 11.10.0 (`packageManager`)                  | —                          | Required                                                                                       |
| Next.js      | 16.3.8 (exact)                              | —                          | Current stable                                                                                 |
| React        | 19.3.0 (exact)                              | —                          | Current stable                                                                                 |
| TypeScript   | 6.0.3                                       | 7.0.2                      | `typescript-eslint` 8.x supports `<6.1`. TS 7 would break type-aware linting.                  |
| ESLint       | 9.39                                        | 10.x                       | `eslint-config-next` plugin compatibility. Revisit when its plugins declare ESLint 10 support. |
| Prisma       | 7.10.0 (exact)                              | 8.0.0-rc.19 (`latest` tag) | Release candidate                                                                              |
| Better Auth  | 1.7.7 (exact)                               | —                          | Auth library pinned exactly. Upgrade deliberately.                                             |
| Vitest       | 5.0                                         | —                          | Current stable                                                                                 |
| Playwright   | 1.63                                        | —                          | Current stable                                                                                 |
| Tailwind CSS | 4.3                                         | —                          | Current stable                                                                                 |

Security-sensitive or framework-defining packages (Next.js, React, Prisma, Better Auth) are pinned
exactly. Others use caret ranges, locked by `pnpm-lock.yaml`. CI installs with `--frozen-lockfile`.

## Consequences

- Upgrades are deliberate pull requests that run the full CI suite.
- Revisit TypeScript 7 and ESLint 10 when `typescript-eslint` and `eslint-config-next` support them.
