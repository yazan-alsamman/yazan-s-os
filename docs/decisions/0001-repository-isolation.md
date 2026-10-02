# ADR 0001 — Dedicated PEOS Git repository

**Status:** Accepted · 2026-10-02

## Context

The repository audit (`docs/audits/PHASE_00_REPOSITORY_AUDIT.md`, finding TD-001/SEC-001) found that
the PEOS directory had no repository of its own. Git resolved it to a repository rooted at the
user's home directory (`C:\Users\Lenovo`): no commits, no `.gitignore`, and an `origin` remote
pointing to an unrelated project. Running `git add -A` in that context could stage credential
material (`.git-credentials`, `.ssh/`) and push it to the unrelated remote.

## Decision

- Initialise a dedicated repository at the PEOS root
  (`C:\Users\Lenovo\Desktop\yazan\Yazan_Personal_Engineering_OS_Spec`), default branch `main`.
- Configure **no remote** until the owner explicitly provides one. Nothing is pushed.
- Before any Git write, verify `git rev-parse --show-toplevel` equals the PEOS root.
- The home-directory repository is **not modified, removed or reconfigured**. Whether it should
  exist at all is the owner's decision.

## Alternatives considered

- _Move PEOS outside the home-directory tree:_ also isolates it, but moving the owner's folder was
  not requested.
- _Delete the home-directory `.git`:_ outside PEOS's scope and destructive.
- _Keep working inside the home-directory repository:_ unsafe (credential exposure, unrelated history).

## Consequences

- Git commands run inside PEOS now resolve to the PEOS repository, because a nested repository takes
  precedence over the parent.
- The parent repository still lists the PEOS directory as untracked. It cannot stage PEOS contents
  as normal files because they belong to a nested repository.
- The home-directory repository remains a risk for _other_ folders. That is recorded and left to
  the owner.
- A remote must be added deliberately: `git remote add origin <url>`.
