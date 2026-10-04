#!/usr/bin/env bash
#
# PEOS database restore (Phase 12, ADR 0058).
#
# Restores a pg_dump custom-format artifact into a TARGET database. By design this refuses to run
# unless TARGET_DATABASE_URL is set explicitly — so a restore is always a deliberate choice of
# destination and never silently overwrites the database in DATABASE_URL.
#
# Usage:
#   TARGET_DATABASE_URL=postgresql://user:pass@host:5432/restore_target \
#     ./scripts/restore.sh path/to/backup.dump
#
# For a real disaster recovery the target is a freshly created, empty database; use --clean only
# when intentionally restoring over an existing one. See DISASTER_RECOVERY.md.
set -euo pipefail

artifact="${1:?Usage: TARGET_DATABASE_URL=... ./scripts/restore.sh <backup.dump>}"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required (explicit destination; never defaults to DATABASE_URL)}"

[ -f "$artifact" ] || { echo "[restore] artifact not found: $artifact" >&2; exit 1; }

echo "[restore] validating archive…"
pg_restore --list "$artifact" >/dev/null

target_db="$(printf '%s' "$TARGET_DATABASE_URL" | sed -E 's#.*/([^/?]+).*#\1#')"
echo "[restore] restoring into '${target_db}' …"
# --no-owner/--no-privileges keep the restore portable across roles; --exit-on-error fails loudly.
pg_restore --dbname="$TARGET_DATABASE_URL" --no-owner --no-privileges --exit-on-error "$artifact"

echo "[restore] done — run post-restore validation (see BACKUP_AND_RESTORE.md §Validation)"
