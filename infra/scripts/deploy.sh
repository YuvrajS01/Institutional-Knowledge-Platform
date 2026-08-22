#!/usr/bin/env bash
# Production deployment automation (P9-007) — builds, migrates, verifies, and starts.
# Usage: ./infra/scripts/deploy.sh [environment]
# Requires: docker, docker compose, pnpm, env vars (see .env.example)
set -euo pipefail

ENVIRONMENT="${1:-production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

echo "==> Deploying to $ENVIRONMENT via $COMPOSE_FILE"

# 1. Validate env
echo "==> Validating environment..."
if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy .env.example to .env and fill secrets." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a

for var in DATABASE_URL JWT_SECRET S3_ACCESS_KEY S3_SECRET_KEY; do
  if [ -z "${!var:-}" ]; then
    echo "ERROR: $var is required in .env" >&2
    exit 1
  fi
done
if [ ${#JWT_SECRET} -lt 32 ]; then
  echo "ERROR: JWT_SECRET must be >=32 chars" >&2
  exit 1
fi

# 2. Build
echo "==> Building images..."
docker compose -f "$COMPOSE_FILE" build

# 3. Start infra
echo "==> Starting infrastructure (postgres, redis, minio)..."
docker compose -f "$COMPOSE_FILE" up -d postgres redis minio
echo "==> Waiting for infra health..."
for i in {1..30}; do
  if docker compose -f "$COMPOSE_FILE" ps | grep -q "healthy"; then break; fi
  sleep 2
done

# 4. Migrate
echo "==> Running migrations..."
pnpm db:migrate

# 5. Start app
echo "==> Starting api, worker, web..."
docker compose -f "$COMPOSE_FILE" up -d api worker web

# 6. Health checks
echo "==> Waiting for api health..."
for i in {1..30}; do
  if curl -sf http://localhost:${API_PORT:-4000}/health >/dev/null 2>&1; then
    echo "API healthy"
    break
  fi
  if [ "$i" = 30 ]; then
    echo "ERROR: API health check failed" >&2
    docker compose -f "$COMPOSE_FILE" logs api | tail -n 50
    exit 1
  fi
  sleep 2
done

if ! curl -sf http://localhost:${API_PORT:-4000}/ready >/dev/null 2>&1; then
  echo "WARNING: /ready not ready (check DB/Redis)" >&2
fi
if ! curl -sf http://localhost:${API_PORT:-4000}/metrics >/dev/null 2>&1; then
  echo "WARNING: /metrics not responding" >&2
fi

echo "==> Verifying backup..."
if [ -x ./infra/scripts/backup.sh ]; then
  ./infra/scripts/backup.sh ./backups || echo "Backup check skipped (no DATABASE_URL)"
fi

echo "==> Deployment complete for $ENVIRONMENT"
echo "  API: http://localhost:${API_PORT:-4000}/health"
echo "  Web: http://localhost:${WEB_PORT:-3000}"
echo "  Metrics: http://localhost:${API_PORT:-4000}/metrics"
echo "To rollback: ./infra/scripts/rollback.sh"
