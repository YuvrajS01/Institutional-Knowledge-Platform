#!/usr/bin/env bash
# Rollback script (P9-007) — rolls back to previous backup or previous image.
# Usage: ./infra/scripts/rollback.sh [backup_file]
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

if [ -n "${1:-}" ]; then
  BACKUP_FILE="$1"
  if [ ! -f "$BACKUP_FILE" ]; then
    echo "Backup file not found: $BACKUP_FILE" >&2
    exit 1
  fi
  echo "==> Rolling back DB from $BACKUP_FILE"
  ./infra/scripts/restore.sh "$BACKUP_FILE"
else
  echo "==> Rolling back containers to previous images (docker compose down + up)"
  echo "No backup file specified; only restarting containers. To restore DB, pass a backup file:"
  echo "  $0 ./backups/<db>-<timestamp>.sql.gz"
fi

echo "==> Restarting services..."
docker compose -f "$COMPOSE_FILE" down
docker compose -f "$COMPOSE_FILE" up -d

echo "==> Waiting for health..."
for i in {1..30}; do
  if curl -sf http://localhost:${API_PORT:-4000}/health >/dev/null 2>&1; then
    echo "API healthy after rollback"
    break
  fi
  if [ "$i" = 30 ]; then
    echo "ERROR: API not healthy after rollback" >&2
    exit 1
  fi
  sleep 2
done

echo "==> Rollback complete"
