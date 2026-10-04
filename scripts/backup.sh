#!/usr/bin/env bash
#
# PEOS database backup (Phase 12, ADR 0058).
#
# Creates a compressed, consistent logical backup of the PostgreSQL database using the custom
# format (pg_dump -Fc), which supports selective, parallel restore. Deterministic, dependency-light
# (only the Postgres client tools), and safe to run against a live database (pg_dump takes a
# consistent MVCC snapshot without blocking writers).
#
# Usage:
#   DATABASE_URL=postgresql://user:pass@host:5432/db ./scripts/backup.sh [OUT_DIR]
#
# Environment:
#   DATABASE_URL   required — the database to back up.
#   BACKUP_DIR     optional — output directory (default: ./backups, or $1).
#   RETENTION_DAYS optional — delete local backups older than this (default: 14).
#
# The artifact is named peos-<db>-<UTC timestamp>.dump. Backups contain data and MUST be treated
# as sensitive: store them encrypted at rest with access controls (see BACKUP_AND_RESTORE.md).
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${1:-${BACKUP_DIR:-./backups}}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

db_name="$(printf '%s' "$DATABASE_URL" | sed -E 's#.*/([^/?]+).*#\1#')"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
artifact="${BACKUP_DIR}/peos-${db_name}-${timestamp}.dump"

echo "[backup] dumping '${db_name}' → ${artifact}"
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$artifact"

size="$(du -h "$artifact" | cut -f1)"
echo "[backup] wrote ${artifact} (${size})"

# Integrity check: the archive table of contents must be readable.
pg_restore --list "$artifact" >/dev/null
echo "[backup] verified archive is readable (pg_restore --list)"

# Local retention pruning (object-store lifecycle rules handle remote retention).
find "$BACKUP_DIR" -maxdepth 1 -name "peos-${db_name}-*.dump" -type f -mtime "+${RETENTION_DAYS}" -print -delete || true

echo "[backup] done"
