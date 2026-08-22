#!/usr/bin/env bash
# Restore script (P9-006) — restores DB from backup.
# Usage: ./infra/scripts/restore.sh <backup_file> [target_DATABASE_URL]
# WARNING: This will overwrite the target DB.
set -euo pipefail

BACKUP_FILE="${1:-}"
TARGET_URL="${2:-${DATABASE_URL:-}}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file> [target_DATABASE_URL]" >&2
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

if [ -z "$TARGET_URL" ]; then
  if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
    TARGET_URL="${DATABASE_URL:-}"
  fi
fi

if [ -z "$TARGET_URL" ]; then
  echo "TARGET_URL not set" >&2
  exit 1
fi

echo "Restoring $BACKUP_FILE to $TARGET_URL ..."
echo "WARNING: This will overwrite data. Continue? (y/N)"
read -r confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Aborted"
  exit 0
fi

# For .sql.gz, gunzip and psql
if [[ "$BACKUP_FILE" == *.gz ]]; then
  gunzip -c "$BACKUP_FILE" | psql "$TARGET_URL"
else
  psql "$TARGET_URL" < "$BACKUP_FILE"
fi

echo "Restore complete. Verify with: psql \$DATABASE_URL -c 'SELECT count(*) FROM documents;'"
