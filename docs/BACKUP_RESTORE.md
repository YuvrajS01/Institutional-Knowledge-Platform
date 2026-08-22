# Backup & Restore (P9-006)

**Validated:** `pg_dump` + `gunzip` + `psql` on `pgvector:pg17`, MinIO bucket `institutional-documents`.

## Targets

- **RPO ≤ 24h, RTO ≤ 8h** (TECHNICAL_SPEC §27)
- Daily DB backups, point-in-time where supported, object storage versioning.

## Backup

```bash
# From repo root, with .env (DATABASE_URL set)
./infra/scripts/backup.sh ./backups
# or explicit
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/institutional_knowledge ./infra/scripts/backup.sh
```

Creates `./backups/<db>-<timestamp>.sql.gz` via `pg_dump | gzip -9`, verifies `gzip -t` and header, lists MinIO bucket if `mc` configured.

## Restore

```bash
# Dry-run verify
gzip -t ./backups/institutional_knowledge-20260820T*.sql.gz && echo OK

# Restore (will prompt)
./infra/scripts/restore.sh ./backups/institutional_knowledge-20260820T*.sql.gz
# Or to a different DB
./infra/scripts/restore.sh ./backups/file.sql.gz postgresql://postgres:postgres@localhost:5432/institutional_knowledge_test
```

## Object Storage

- MinIO: versioning enabled via `mc version enable local/institutional-documents` (if needed)
- Managed S3/R2: enable bucket versioning in console
- Backup: `mc mirror local/institutional-documents s3/backup-bucket` or `rclone sync`

## Validation (P9-006)

```bash
# 1. Backup
./infra/scripts/backup.sh ./backups

# 2. Verify gzip integrity
gzip -t ./backups/*.sql.gz

# 3. Restore to test DB
createdb institutional_knowledge_restore_test
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/institutional_knowledge_restore_test ./infra/scripts/restore.sh ./backups/*.sql.gz postgresql://postgres:postgres@localhost:5432/institutional_knowledge_restore_test
psql postgresql://postgres:postgres@localhost:5432/institutional_knowledge_restore_test -c "SELECT count(*) FROM documents; SELECT count(*) FROM document_versions;"
dropdb institutional_knowledge_restore_test

# 4. Object storage
mc ls local/institutional-documents
```

## Automation

- **Cron:** `0 2 * * * /path/to/backup.sh /var/backups/institutional-knowledge`
- **Retention:** Keep 7 daily + 4 weekly (rotate via `find ./backups -mtime +7 -delete`)
- **Monitoring:** Check `backups/*.sql.gz` exists and `gzip -t` passes in health check; alert if missing >25h.

## Disaster Recovery Runbook

1. Provision new `pgvector:pg17` + `redis` + `minio` via `docker compose up -d`.
2. Restore DB: `gunzip -c latest.sql.gz | psql $DATABASE_URL`.
3. Run migrations: `pnpm db:migrate` (idempotent).
4. Sync object storage: `mc mirror s3/backup-bucket local/institutional-documents`.
5. Verify: `psql -c "SELECT count(*) FROM documents"` + `curl /health` + `curl /ready`.
6. DNS cutover.

## Secrets

- `DATABASE_URL` and `S3_*` from `.env` (never committed), or secret manager (see `.env.example`).
- Backups are encrypted at rest if bucket encryption enabled; for DB dumps, use `gpg -c` if needed.
