# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 3 (Document Processing) — in progress.

## Current Task

**P3-008** (Implement chunking) — implementation complete on task branch `feat/P3-008-chunking`; PR pending human approval.

## Current Branch

`feat/P3-008-chunking`

## Overall Status

`PHASE_3_IN_PROGRESS` — queue, extraction, OCR, orchestration, metadata interface, and chunking done; metadata provider and date extraction pending.

## Last Completed Task

P3-008 (Implement chunking) — paragraph-aware deterministic chunker with 10–20% overlap; 196 tests passing.

## What Is Working

- Everything from Phases 0–2 + P3-001..P3-005 (merged into `main` via PRs #1–#22).
- Chunking (this PR):
  - **`packages/processing` chunker** (`packages/processing/src/chunker.ts:1`): deterministic, local-first, char-based token estimation (`estimateTokenCount` ≈ `chars/4`, `TECHNICAL_SPEC §9` 300–700 tokens, `AI_LLM_ARCHITECTURE §8`).
  - Defaults: `DEFAULT_CHUNK_TARGET_TOKENS=500`, `DEFAULT_CHUNK_OVERLAP_TOKENS=75` (15%), `DEFAULT_CHUNK_MAX_TOKENS=700`, `DEFAULT_CHUNK_MIN_TOKENS=100` — all within spec ranges.
  - **Boundary preference**: splits on paragraph (`\n\n`) → sentence (`/[.!?।]\s+/`) → line (`\n`) boundaries before hard char-slice for oversized segments; preserves page number via `pages[]` array (chunk per page, `chunkIndex` sequential, `pageNumber` 1..N, `tokenCount`/`charCount` per chunk).
  - **Overlap**: suffix of `overlapTokens*4` chars (word-boundary adjusted) carried to next chunk; tested to appear in next chunk prefix.
  - **Edge handling**: empty → 0 chunks, short → 1 chunk (page 1), oversized single paragraph → hard-split into ≤700-token slices with overlap, Hindi Devanagari content preserved, deterministic output.
  - Exports: `chunkDocument`, `DocumentChunker`, `createChunker`, constants; re-exported via `packages/processing/src/index.ts:1`. No DB migration — `document_chunks` table is P5-001 (depends on this chunker).
- Prior metadata interface:
  - **`MetadataExtractor` contract** with Zod validation, `HeuristicMetadataExtractor` baseline (title/type/summary/tags/academicYear/course/semester/language/confidence).
- Prior processing orchestration:
  - **Worker pipeline**: `document.process` job → tenant-scoped version lookup → download original → text extraction → OCR when inadequate → persist `extracted_text`/`ocr_status`/`page_count`/`processing_status` → write `extracted.txt` artifact.
  - Idempotent, tenant-aware, retryable (BullMQ attempts/backoff), observable (`processing_status` QUEUED→PROCESSING→COMPLETED/FAILED + worker logs).
  - **API enqueue**: `upload-complete` now enqueues `document.process` (deterministic jobId → no duplicates).
  - `processing_status` column added to `document_versions`.
  - **`packages/storage`** extracted (shared ObjectStorage interface + S3 adapter + storage keys) — used by both API and worker (no duplication).

## What Is Not Implemented

- Phase 3 remainder: metadata extraction LLM provider (P3-006), date extraction (P3-007), retry/status UI (P3-009), scanned-PDF integration tests (P3-010). **P5-001** (document chunk storage schema) will persist these chunks for embeddings/search.
- PDF page rasterization for scanned-PDF OCR (backlogged).
- Phases 4–10.

## Active Blockers

- PR requires human approval to merge into `main` (repository merge policy).

## Important Decisions

- **Working product title:** Institutional Knowledge Platform.
- Final commercial branding is intentionally deferred until MVP validation.
- Technical identifiers remain product-name agnostic (`@ikp/*` package scope).
- Stack: pnpm workspace; Fastify (API); Next.js (web); Vitest; ESLint flat config; Prettier; node-pg-migrate; PostgreSQL/pgvector; Redis; MinIO (S3-compatible).
- API and worker use distinct port variables (`API_PORT`, `WORKER_PORT`) because they share the repo `.env`.
- Migrations are CommonJS `.js` files under `infra/migrations/`; ESLint flat config declares CJS globals for that directory.
- AI providers remain replaceable through adapters/interfaces (chunker follows same deterministic pattern; no model dependency).
- Git uses task branches and pull requests; merging into `main` requires the repository's approval policy.

## Current Git State

`main` contains merged Phases 0–2 + P3-001..P3-005 (PR #22). Task branch `feat/P3-008-chunking` adds the chunking implementation, all checks green:

```text
lint ✅  typecheck ✅ (13/13, incl. processing)  tests ✅ (196, +20 chunking)  build ✅ (8/8)  format ✅
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
| Unit/integration tests | PASS (196) |
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
| E2E tests | NOT STARTED (Phase 9) |
| Security verification | NOT STARTED |
| Search evaluation | NOT STARTED |
| AI/RAG evaluation | NOT STARTED |

## Next Recommended Action

After P3-008 merges, start **P3-006** (Implement metadata extraction provider — P1, depends P3-005) or **P3-009** / **P3-010** (retry/status UI & scanned-PDF tests) from updated `main`. **P5-001** (document chunk storage schema — P0) becomes unblocked after P3-008.

## Last Updated

2026-08-19
