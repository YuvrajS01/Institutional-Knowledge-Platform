# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 2 (Document Core) — in progress.

## Current Phase

Phase 3 (Document Processing) — in progress.

## Current Task

**P3-004** (Implement processing orchestration) — implementation complete on task branch `feat/P3-004-processing-orchestration`; PR pending human approval.

## Current Branch

`feat/P3-004-processing-orchestration`

## Overall Status

`PHASE_3_IN_PROGRESS` — queue, extraction, OCR, and orchestration done; metadata/date extraction and chunking pending. **Uploads now actually process.**

## Last Completed Task

P3-004 (Implement processing orchestration) — verified live: upload → enqueue → worker extracts text → COMPLETED.

## What Is Working

- Everything from Phases 0–2 + P3-001..P3-003 (merged into `main` via PRs #1–#20).
- Processing orchestration (this PR):
  - **Worker pipeline**: `document.process` job → tenant-scoped version lookup → download original → text extraction → OCR when inadequate (raster images OCR'd now; scanned PDFs marked `REQUIRED`, rasterization backlogged) → persist `extracted_text`/`ocr_status`/`page_count`/`processing_status` → write `extracted.txt` artifact.
  - Idempotent (completed versions skipped), tenant-aware, retryable (BullMQ attempts/backoff), observable (`processing_status` column + worker logs).
  - **API enqueue**: `upload-complete` now enqueues `document.process` (deterministic jobId → no duplicates).
  - `processing_status` column added to `document_versions` (QUEUED→PROCESSING→COMPLETED/FAILED).
  - **`packages/storage`** extracted (shared ObjectStorage interface + S3 adapter + storage keys) — used by both API and worker (no duplication).
  - Worker env now requires DATABASE_URL/REDIS_URL/S3_*.

## What Is Not Implemented

- Phase 3 remainder: metadata extraction interface (P3-005), providers (P3-006/007), chunking (P3-008), retry/status UI (P3-009), scanned-PDF integration tests (P3-010).
- PDF page rasterization for scanned-PDF OCR (backlogged).
- Phases 4–10.

## Active Blockers

- P1-001 PR requires human approval to merge into `main` (repository merge policy).

## Important Decisions

- **Working product title:** Institutional Knowledge Platform.
- Final commercial branding is intentionally deferred until MVP validation.
- Technical identifiers remain product-name agnostic (`@ikp/*` package scope).
- Stack: pnpm workspace; Fastify (API); Next.js (web); Vitest; ESLint flat config; Prettier; node-pg-migrate; PostgreSQL/pgvector; Redis; MinIO (S3-compatible).
- API and worker use distinct port variables (`API_PORT`, `WORKER_PORT`) because they share the repo `.env`.
- Migrations are CommonJS `.js` files under `infra/migrations/`; ESLint flat config declares CJS globals for that directory.
- AI providers remain replaceable through adapters/interfaces.
- Git uses task branches and pull requests; merging into `main` requires the repository's approval policy.

## Current Git State

`main` contains merged Phases 0–2 + P3-001..P3-003. Task branch `feat/P3-004-processing-orchestration` adds the processing pipeline, all checks green:

```text
lint ✅  typecheck ✅ (incl. tests, 13/13)  tests ✅ (156, incl. processing pipeline)  build ✅ (8/8)  format ✅  live loop ✅ (upload → enqueue → worker → COMPLETED + extracted_text)
```

## Model Handoff Instructions

When switching AI tools/models:

1. Read `.agent/AGENTS.md`.
2. Read `.agent/INSTRUCTIONS.md`.
3. Read this file.
4. Read `.agent/planning/TASK_MANIFEST.md`.
5. Run `git status`, `git branch`, and `git log`.
6. Inspect the current task branch and recent commits.
7. Continue from the actual repository state.
8. Do not redo work merely because another model implemented it.
9. Update this file before handing the repository to another model.

## Verification Snapshot

| Check | Status |
|---|---|
| Repository structure | PASS |
| TypeScript strict typecheck | PASS |
| Lint | PASS |
| Format | PASS |
| Build (all packages) | PASS |
| Unit/integration tests | PASS (132) |
| Migrations against Postgres (up/down/up) | PASS |
| Health/readiness live checks | PASS (API + worker) |
| Authentication live flow (login → me) | PASS |
| RBAC guard (roles, tenant scope, cross-tenant) | PASS |
| Tenant repository isolation (cross-tenant) | PASS |
| Cross-tenant security matrix (4 actors × 14 capabilities × 2 tenants) | PASS |
| Admin API + web admin flow (live) | PASS |
| Object storage (MinIO: put/get/head/presign/delete) | PASS |
| Signed upload flow (create → presigned PUT → confirm, sha256) | PASS |
| Document CRUD + visibility (draft hidden from students) | PASS |
| Document lifecycle (full walk + guards) | PASS |
| Audit trail (lifecycle events + admin API, tenant-scoped) | PASS |
| Admin document list UI (live walk: submit→approve→publish) | PASS |
| Upload/review UI (live: form → upload → queued → submit) | PASS |
| Job queue (Redis: delivery, retry, idempotency) | PASS |
| PDF text extraction (native + scanned-style) | PASS |
| Processing pipeline (live: upload → enqueue → extract → COMPLETED) | PASS |
| E2E tests | NOT STARTED (Phase 9) |
| Security verification | NOT STARTED |
| Search evaluation | NOT STARTED |
| AI/RAG evaluation | NOT STARTED |

## Next Recommended Action

After P3-004 merges, start **P3-005** (Implement metadata extraction interface) from updated `main` on branch `feat/P3-005-metadata-interface`.

## Last Updated

2026-08-13
