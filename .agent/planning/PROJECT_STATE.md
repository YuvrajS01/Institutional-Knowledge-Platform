# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 3 (Document Processing) — in progress.

## Current Task

**P3-005** (Implement metadata extraction interface) — implementation complete on task branch `feat/P3-005-metadata-interface`; PR pending human approval.

## Current Branch

`feat/P3-005-metadata-interface`

## Overall Status

`PHASE_3_IN_PROGRESS` — queue, extraction, OCR, orchestration, and metadata interface done; metadata provider, date extraction, and chunking pending.

## Last Completed Task

P3-005 (Implement metadata extraction interface) — deterministic heuristic extractor with provider abstraction; 176 tests passing.

## What Is Working

- Everything from Phases 0–2 + P3-001..P3-004 (merged into `main` via PRs #1–#21).
- Metadata extraction interface (this PR):
  - **`packages/processing` metadata contract**: `MetadataExtractor` interface (`name()` + `extract(input)`) with Zod-validated `MetadataExtractionResult` (`TECHNICAL_SPEC §8` deterministic + AI-assisted, `IMPLEMENTATION_GUIDE §7`).
  - **Heuristic baseline** (`HeuristicMetadataExtractor`, `createMetadataExtractor()`): local-first, deterministic extraction for title (first line / filename fallback, 200-char cap), documentType (keyword classification), summary (first 2 sentences / 300-char fallback), tags (institutional keyword match + frequency supplement, deduped ≤10), academicYear (regex normalized), course/semester (regex), language (Devanagari → hin else eng), confidence (0.1–0.55), provider `heuristic`.
  - Validation: every result parsed through `metadataExtractionResultSchema` (Zod), ensuring provider abstraction can safely swap to an LLM provider in P3-006 without changing callers (ADR-003/007).
  - No pipeline wiring yet — P3-006 will inject the extractor into `ProcessingService` and persist to `documents`/`document_metadata` (proposal remains editable before publication per PRD FR-004).
- Prior processing orchestration:
  - **Worker pipeline**: `document.process` job → tenant-scoped version lookup → download original → text extraction → OCR when inadequate → persist `extracted_text`/`ocr_status`/`page_count`/`processing_status` → write `extracted.txt` artifact.
  - Idempotent, tenant-aware, retryable (BullMQ attempts/backoff), observable (`processing_status` QUEUED→PROCESSING→COMPLETED/FAILED + worker logs).
  - **API enqueue**: `upload-complete` now enqueues `document.process` (deterministic jobId → no duplicates).
  - `processing_status` column added to `document_versions`.
  - **`packages/storage`** extracted (shared ObjectStorage interface + S3 adapter + storage keys) — used by both API and worker (no duplication).

## What Is Not Implemented

- Phase 3 remainder: metadata extraction LLM provider (P3-006), date extraction (P3-007), chunking (P3-008), retry/status UI (P3-009), scanned-PDF integration tests (P3-010).
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
- AI providers remain replaceable through adapters/interfaces (metadata extractor follows same OCR/TextExtractor pattern).
- Git uses task branches and pull requests; merging into `main` requires the repository's approval policy.

## Current Git State

`main` contains merged Phases 0–2 + P3-001..P3-004 (PR #21). Task branch `feat/P3-005-metadata-interface` adds the metadata interface + heuristic extractor, all checks green:

```text
lint ✅  typecheck ✅ (13/13, incl. processing)  tests ✅ (176, +20 metadata)  build ✅ (8/8)  format ✅
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
| Unit/integration tests | PASS (176) |
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
| E2E tests | NOT STARTED (Phase 9) |
| Security verification | NOT STARTED |
| Search evaluation | NOT STARTED |
| AI/RAG evaluation | NOT STARTED |

## Next Recommended Action

After P3-005 merges, start **P3-006** (Implement metadata extraction provider) or **P3-008** (Implement chunking) from updated `main` — P3-008 is P0 and now unblocked alongside P3-006.

## Last Updated

2026-08-19
