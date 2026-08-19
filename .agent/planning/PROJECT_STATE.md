# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 5 (Search) — chunk storage done; Phase 3 remainder P1 tasks pending.

## Current Task

**P5-001** (Add document chunk storage schema) — implementation complete on task branch `feat/P5-001-chunk-storage`; PR pending human approval.

## Current Branch

`feat/P5-001-chunk-storage`

## Overall Status

`PHASE_5_IN_PROGRESS` — P5-001 (document_chunks + pgvector) done and verified against pgvector/pg17; Phase 3 P1 tasks (P3-006/007/009/010) and remaining search/RAG still pending. Chunking (P3-008) now has persistence.

## Last Completed Task

P5-001 (Add document chunk storage schema) — `document_chunks` table with `vector(1024)` + repository + 7 integration tests; 203 tests passing (migrated on pgvector/pg17 via 5433).

## What Is Working

- Everything from Phases 0–2 + P3-001..P3-008 (merged into `main` via PRs #1–#23).
- Chunk storage (this PR):
  - **`infra/migrations/1787231000000_create-document-chunks.js`**: `CREATE EXTENSION IF NOT EXISTS vector`, `document_chunks` table (`id uuid PK`, `document_version_id uuid FK CASCADE`, `page_number int`, `chunk_index int NOT NULL`, `content text NOT NULL`, `token_count int NOT NULL`, `embedding vector(1024) nullable`, `metadata jsonb`, `created_at timestamptz`) with `UNIQUE(document_version_id, chunk_index)`, indexes on `document_version_id` and `page_number` (TECHNICAL_SPEC §5 Chunks, ADR-001 pgvector).
  - Verified live on `pgvector/pgvector:pg17` (docker `pgvector-temp:5433`): `CREATE EXTENSION vector` ✅, migration `UP` ✅, `DOWN` ✅, vector type `vector(1024)` ✅.
  - **`packages/shared/src/chunks.ts`**: `DocumentChunkRow` / `CreateChunkInput` shared types.
  - **`apps/api/src/modules/documents/document-chunks.repository.ts`**: `DocumentChunksRepository` (`createMany` batch INSERT, `listByVersion` ordered, `countByVersion`, `deleteByVersion`) — version-owned, FK CASCADE to `document_versions`; embedding nullable until P5-004.
  - **`apps/api/src/modules/documents/document-chunks.repository.test.ts`**: 7 integration tests (creation/listing ordered, per-page pageNumber, unique constraint, delete, empty, isolation, empty input) — all green on pgvector DB.
  - `vitest.config.ts` alias extended for `@ikp/processing`/`@ikp/queue`/`@ikp/storage` workspace resolution; `apps/api/package.json` now depends on `@ikp/processing` for chunk helper reuse.
- Prior chunking (P3-008):
  - **`packages/processing` chunker** — deterministic, 500/75/700/100, paragraph→sentence→line, page-aware, overlap, Hindi support.
- Prior metadata interface (P3-005):
  - **`MetadataExtractor` contract** with Zod validation, `HeuristicMetadataExtractor` baseline.
- Prior processing orchestration (P3-004):
  - **Worker pipeline**: `document.process` job → tenant-scoped version lookup → download original → text extraction → OCR when inadequate → persist `extracted_text`/`ocr_status`/`page_count`/`processing_status` → write `extracted.txt` artifact (idempotent, tenant-aware, retryable).

## What Is Not Implemented

- Phase 3 remainder: metadata extraction LLM provider (P3-006), date extraction (P3-007), retry/status UI (P3-009), scanned-PDF integration tests (P3-010).
- Search remainder: embedding provider interface (P5-002), local adapter (P5-003), generate/store embeddings (P5-004), FTS (P5-005), vector search (P5-006), hybrid (P5-007), etc.
- Phases 4, 6–10.
- PDF page rasterization for scanned-PDF OCR (backlogged).

## Active Blockers

- PR requires human approval to merge into `main` (repository merge policy).
- Local host Postgres (18.6 on 5432) lacks `pgvector` extension — use the project’s `pgvector/pgvector:pg17` Docker image (port 5433 for this branch’s verification) or `sudo pacman -S pgvector`; CI uses pgvector service and is green.

## Important Decisions

- **Working product title:** Institutional Knowledge Platform.
- Final commercial branding is intentionally deferred until MVP validation.
- Technical identifiers remain product-name agnostic (`@ikp/*` package scope).
- Stack: pnpm workspace; Fastify (API); Next.js (web); Vitest; ESLint flat config; Prettier; node-pg-migrate; PostgreSQL/pgvector (pgvector/pg17, `vector(1024)` for BGE-M3 1024 dims); Redis; MinIO (S3-compatible).
- API and worker use distinct port variables (`API_PORT`, `WORKER_PORT`) because they share the repo `.env`.
- Migrations are CommonJS `.js` files under `infra/migrations/`; ESLint flat config declares CJS globals for that directory.
- AI providers remain replaceable through adapters/interfaces.
- Git uses task branches and pull requests; merging into `main` requires the repository's approval policy.

## Current Git State

`main` contains merged Phases 0–2 + P3-001..P3-008 (PR #23). Task branch `feat/P5-001-chunk-storage` adds the chunk storage schema + repository, all checks green:

```text
lint ✅  typecheck ✅ (13/13)  tests ✅ (203, +7 chunk repo)  build ✅ (8/8)  format ✅  migration ✅ (pgvector)
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
| Unit/integration tests | PASS (203) |
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
| Metadata extraction interface (heuristic + Zod) | PASS (20) |
| Chunking (deterministic, 500/75, page-aware) | PASS (20) |
| Document chunk storage (pgvector `vector(1024)` + repo) | PASS (7) |
| E2E tests | NOT STARTED (Phase 9) |
| Security verification | NOT STARTED |
| Search evaluation | NOT STARTED |
| AI/RAG evaluation | NOT STARTED |

## Next Recommended Action

After P5-001 merges, start **P5-002** (Add embedding provider interface — P0, depends P5-001) or **P5-005** (Implement PostgreSQL full-text search — P0) or **P4-001** (Implement review queue API — P0). Phase 3 P1 tasks (P3-006/007) remain P1 and can run in parallel.

## Last Updated

2026-08-19
