# Deployment (P9-007)

**Stack:** `Fastify` API (`:4000`), `Next.js` web (`:3000`), `pgvector:pg17`, `redis:7`, `minio`, BullMQ worker.

## Prerequisites

- `Node >=22`, `pnpm@10`, `Docker + Compose`
- `.env` from `.env.example` (fill `DATABASE_URL`, `JWT_SECRET` ≥32, `S3_*`, `REDIS_URL`)
- For production, set `NODE_ENV=production` and use `docker-compose.prod.yml` (secrets required, not defaults).

## Local Development

```bash
pnpm install
pnpm build:packages
docker compose up -d   # postgres:5432, redis:6379, minio:9000
pnpm db:migrate
pnpm dev               # api:4000, web:3000, worker:4100
# Verify
curl http://localhost:4000/health
curl http://localhost:4000/ready
curl http://localhost:4000/metrics
```

## Production (P9-007)

### 1. Prepare secrets

```bash
cp .env.example .env
# Edit .env: DATABASE_URL, JWT_SECRET (≥32), POSTGRES_PASSWORD, REDIS_PASSWORD, S3_ACCESS_KEY/SECRET_KEY, API_PORT/WEB_PORT
```

### 2. Deploy

```bash
./infra/scripts/deploy.sh production
# Or explicit
COMPOSE_FILE=docker-compose.prod.yml ./infra/scripts/deploy.sh production
```

What it does:

1. Validates `.env` (`DATABASE_URL`, `JWT_SECRET` ≥32, `S3_*`).
2. `docker compose -f docker-compose.prod.yml build`
3. Starts `postgres`, `redis`, `minio` and waits for `healthy`.
4. `pnpm db:migrate`
5. Starts `api`, `worker`, `web`.
6. Waits for `http://localhost:4000/health` and `/ready`, then `/metrics`.
7. Runs `backup.sh` as post-deploy verification.

### 3. Verify

```bash
curl http://localhost:4000/health
curl http://localhost:4000/metrics
curl http://localhost:3000
pnpm test   # or DATABASE_URL=...:5434 REDIS_URL=... npx vitest run
```

### 4. Rollback

```bash
# Rollback containers only
./infra/scripts/rollback.sh

# Rollback DB from backup
./infra/scripts/rollback.sh ./backups/institutional_knowledge-20260820T120000Z.sql.gz
```

### 5. Backup (pre-deploy)

```bash
./infra/scripts/backup.sh ./backups
# Validates gzip -t and header
```

## Docker Images

- `infra/docker/api.Dockerfile` / `worker.Dockerfile` / `web.Dockerfile` (if present) — otherwise `build` uses root `Dockerfile` with `COMPOSE_FILE` override.
- Production compose uses `restart: unless-stopped`, healthchecks, and secret-required env (`:?`).

## Environment Matrix

| Var                  | Local                                                      | Production                                                                         |
| -------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `DATABASE_URL`       | `postgres:postgres@localhost:5432/institutional_knowledge` | `postgresql://user:pass@prod-db:5432/db` (required)                                |
| `REDIS_URL`          | `redis://localhost:6379`                                   | `redis://:pass@prod-redis:6379`                                                    |
| `JWT_SECRET`         | `insecure-dev...` (≥32, rejected in prod if default)       | `≥32` random (required)                                                            |
| `S3_*`               | `minioadmin/minioadmin@localhost:9000`                     | Managed S3/R2 (required)                                                           |
| `LLM_PROVIDER`       | `mock`                                                     | `local` (Ollama `http://ollama:11434`) or `cloud` (`openai`/`anthropic` + API key) |
| `EMBEDDING_PROVIDER` | `mock`                                                     | `local` `bge-m3`                                                                   |

## Observability (P9-005)

- `GET /metrics` JSON, `GET /metrics/prometheus` text, `GET /health` / `/ready`.
- Structured logs with `request_id`, `method`, `url`, `statusCode`, `latency_ms` via `pino` + `onResponse` hook.

## CI

- `.github/workflows/ci.yml` runs `lint`, `build`, `typecheck`, `test` with `pgvector:pg17`, `minio`, `redis:7`.
- Migration check runs `pnpm db:migrate` on `pgvector:pg17`.

## Rollback & Recovery

See `docs/BACKUP_RESTORE.md` for RPO 24h/RTO 8h, `backup.sh`/`restore.sh`, and disaster recovery runbook.
