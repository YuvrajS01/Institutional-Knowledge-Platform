# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 9 (Hardening) — P9-001/002/008 DONE; Phase 8 (Institutional AI) P0 DONE; Phase 5 — P5-008 DONE (merged #55); Phase 3 — P3-006/007 DONE (merged #53/#54), P3-009 DONE on task branch `feat/P3-009-processing-status-ui`, P3-010 still TODO.

## Current Task

**P3-009** (Add processing retry/status UI — P1) — implementation complete on task branch `feat/P3-009-processing-status-ui`; 9 API tests (GET processing-status + POST retry) passing, polling UI with retry, typecheck/lint/build green, 516 tests total.

## Current Branch

`feat/P3-009-processing-status-ui`

## Overall Status

`PHASE_9_DONE` — all P0 tasks DONE and `docs/FINAL_IMPLEMENTATION_REPORT.md` at `main` `9871939` (P5-008 merged); `PHASE_8_DONE` — all P0 DONE; `PHASE_5_DONE` — P5-001..008/009/010/014 DONE, **P5-008 merged**, P5-011/012/013 TODO; `PHASE_3_PROGRESS` — P3-001..007/008 DONE, **P3-009 DONE on branch** (needs PR), P3-010 TODO.

## Last Completed Task

P3-009 (Add processing retry/status UI — P1) — `apps/api/src/modules/documents/document-versions.repository.ts` (add `processing_status` to `DocumentVersionRow` + SELECT) + `apps/api/src/modules/documents/documents.service.ts` (`getProcessingStatus` with visibility + creator/manager gate, returns version processing_status/ocr_status/page_count/has_extracted_text/is_current; `retryProcessing` creator/manager gate, latest version, `queue.enqueue` idempotent jobId, audit `document.updated` + reset FAILED→QUEUED) + `apps/api/src/modules/documents/documents.route.ts` (`GET /documents/:id/processing-status` requireMember, `POST /documents/:id/retry-processing` requireMember 202) + `apps/web/src/app/admin/documents/upload/page.tsx` (polling `processing-status` every 2s via `apiRequest`, table of version/processing/ocr/pages/text ✓, `FAILED` → Retry button, `COMPLETED` notice, Refresh) + `apps/api/src/modules/documents/processing-status.route.test.ts` 9 integration tests (GET creator 200, student 404, tenant 404, unknown 404, 401, POST retry creator 202 + enqueue + FAILED→QUEUED, student 403, tenant 404, no version 409) + `TASK_MANIFEST` P3-009 TODO→DONE; 516 tests passing (+9), typecheck/lint/build green; pgvector on 5434, web build 10 routes including /admin/documents/upload 3.09kB.

## What Is Working

- Everything from Phases 0–2 + P3-001..P5-001 merged through #55 (`main` at `9871939` includes P5-008 reranker + P3-007 dates + P3-006 metadata LLM).
- Full-text search (P5-005), embedding interface (P5-002), local embedding adapter (P5-003), generate/store embeddings (P5-004), vector search (P5-006), hybrid retrieval (P5-007), search API (P5-009), search UI (P5-010), search eval (P5-014), review queue (P4-001), supersession (P4-003), publication permission (P4-006), document detail API/page (P6-001/002), LLM provider (P8-001), local LLM adapter (P8-002), permission-aware retrieval (P8-004), context builder (P8-005), RAG answer service (P8-006), citation contract (P8-007), unsupported (P8-008), /ai/ask API (P8-009), Ask UI (P8-010), prompt-injection (P8-011), RAG eval (P8-012), cross-tenant RAG (P8-013), E2E critical path (P9-001), security regression (P9-002), final report (P9-008) — all per FINAL_IMPLEMENTATION_REPORT.md.
- **NEW P3-009 (branch)**:
  - **`apps/api/src/modules/documents/document-versions.repository.ts`**: `DocumentVersionRow.processing_status: string` + `mapVersionRow` default QUEUED + `SELECT_COLUMNS`/`SELECT_COLUMNS_PREFIXED` include `processing_status`.
  - **`apps/api/src/modules/documents/documents.service.ts`**: `getProcessingStatus(actor, documentId)` → `DocumentVersionRow[]` with visibility (STUDENT/FACULTY published check, creator/manager gate for drafts) + `retryProcessing` (creator/manager, latest version, `queue.enqueue` jobId `${docId}-v${n}-document.process`, reset FAILED→QUEUED, audit `document.updated` with `processing_retried`).
  - **`apps/api/src/modules/documents/documents.route.ts`**: `GET /documents/:id/processing-status` (requireMember, 300/min, returns `{data: ProcessingStatusEntry[]}`) + `POST /documents/:id/retry-processing` (requireMember, 30/min, returns 202 `{data: {document_id, version_id, processing_status}}`).
  - **`apps/web/src/app/admin/documents/upload/page.tsx`**: Adds `ProcessingStatusEntry` type, `processing`/`processingError`/`retrying` state, `fetchProcessingStatus` via `apiRequest<ProcessingStatusEntry[]>` (handles envelope unwrap), `handleRetry` POST retry-processing, `useEffect` polling every 2s when `phase==='queued'`, UI table (Version/Processing/OCR/Pages/Text), `FAILED` → Retry button, `COMPLETED` notice, Refresh.
  - **`apps/api/src/modules/documents/processing-status.route.test.ts`**: 9 integration (pgvector:pg17, MinIO, S3, mock queue): GET 200 creator, 404 student draft, 404 tenant, 404 unknown, 401, POST 202 creator + enqueue + FAILED→QUEUED, 403 student, 404 tenant, 409 no version.
  - **`apps/web build`**: 10 routes (`/admin/documents/upload` 3.09kB) green.
- Prior P5-008: reranker (31 tests), P3-007: dates (38 tests), P3-006: metadata LLM (23 tests) still passing.

## What Is Not Implemented

- Phase 3 remainder: scanned-PDF integration tests (P3-010).
- Search remainder: filters/facets (P5-011), search analytics (P5-012), unresolved (P5-013).
- Phases 4 remainder: approval queue UI (P4-004), version history UI (P4-005).
- Phases 6 remainder: summary (P6-003 now unblocked by P3-006), important dates API/UI (P6-004 now unblocked by P3-007), bookmarks (P6-005), related (P6-006 now unblocked by P5-008), share (P6-007).
- Phase 7 notifications (P7-001→006).
- P8-003 cloud LLM adapter (P1), P9-003/004/005/006/007 (P1 load/metrics/backup/deploy).
- PDF page rasterization for scanned-PDF OCR (backlogged).

## Active Blockers

- PR requires human approval to merge into `main` (repository merge policy).
- Host Postgres (18.6 on 5432) lacks `pgvector` — use docker `pgvector/pgvector:pg17` on 5434 (`DATABASE_URL=postgresql://postgres:postgres@localhost:5434/institutional_knowledge`) and `REDIS_URL=redis://localhost:6379`; CI green. Host docker compose postgres fails to bind 5432 when host postgres running — use `ikp-pgvector-test-5434`.

## Important Decisions

- **Working product title:** Institutional Knowledge Platform.
- Final commercial branding is intentionally deferred until MVP validation.
- Technical identifiers remain product-name agnostic (`@ikp/*` package scope).
- Stack: pnpm workspace; Fastify (API); Next.js (web); Vitest; ESLint flat config; Prettier; node-pg-migrate; PostgreSQL/pgvector (pgvector/pg17, `vector(1024)` for BGE-M3 1024 dims); Redis; MinIO (S3-compatible).
- API and worker use distinct port variables (`API_PORT`, `WORKER_PORT`) because they share the repo `.env`.
- Migrations are CommonJS `.js` files under `infra/migrations/`; ESLint flat config declares CJS globals for that directory.
- AI providers remain replaceable via adapters; `METADATA_PROVIDER`/`DATE_PROVIDER`/`RERANKER_PROVIDER` mirror `EMBEDDING_PROVIDER`/`LLM_PROVIDER` (ADR-003 local-first).
- Processing status is per-version (`document_versions.processing_status`) and observable via tenant-scoped API; retry is idempotent via `jobId` `${docId}-v${n}-document.process` (AGENTS.md §10).
- Git uses task branches and pull requests; merging into `main` requires the repository's approval policy.

## Current Git State

`main` at `9871939` (Merge PR #55 P5-008). Task branch `feat/P3-009-processing-status-ui` adds processing status/retry (9 tests, upload polling UI), all checks green:

```text
lint ✅  typecheck ✅  tests ✅ (516, +9)  build ✅ (web 10/10)  format ✅  migration ✅ (pgvector on 5434)
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
| Unit/integration tests | PASS (516) |
| Migrations against Postgres (up/down/up) | PASS (5434 pgvector) |
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
| Document chunk storage (pgvector `vector(1024)` + repo) | PASS (8) |
| Embedding provider interface (mock, deterministic) | PASS (13) |
| Local embedding adapter (Ollama/OpenAI, batching, env factory) | PASS (27) |
| Generate/store embeddings (chunk → embed → pgvector) | PASS (8) |
| Vector search (pgvector cosine, tenant, PUBLISHED) | PASS (11) |
| Hybrid retrieval (lexical + vector merge, 0.4/0.6) | PASS (9) |
| Search API (hybrid, tenant, PUBLISHED, facets) | PASS (7) |
| Search results UI (hybrid, filters, pagination, empty) | PASS (build 10/10) |
| Search evaluation set (Recall@5/10, MRR, NDCG) | PASS (6) |
| Review queue API (IN_REVIEW, RBAC, tenant) | PASS (6) |
| Supersession/version APIs (SUPERSEDED, versions) | PASS (9) |
| Publication permission tests (PUBLISHED, SUPERSEDED, search) | PASS (8) |
| Document detail API (PUBLISHED/SUPERSEDED, is_current) | PASS (4) |
| Document detail page (is_current, superseded_by, versions) | PASS (build 10/10) |
| LLM provider interface (mock, deterministic, grounded) | PASS (11) |
| Local LLM adapter (Ollama/OpenAI, chat/generate) | PASS (17) |
| Permission-aware retrieval (PUBLISHED, tenant) | PASS (3) |
| Context builder (maxTokens, citations, no-answer) | PASS (8) |
| RAG answer service (grounded, citations, tenant) | PASS (11) |
| Metadata LLM provider (P3-006) | PASS (23) |
| Date extraction (P3-007) | PASS (38) |
| Reranker (P5-008) | PASS (31) |
| Processing status/retry (P3-009) | PASS (9) |
| Full-text search (tsvector trigger, GIN, ranking) | PASS (4) |
| E2E tests (P9-001) | PASS (10/17 flows) |
| Security regression (P9-002) | PASS (7) |
| Final gate report (P9-008) | DONE |

## Next Recommended Action

After P3-009 merges, start **P3-010** (Add scanned-PDF integration tests — P1) or **P4-004** (Build approval queue UI — P1) or **P6-003** (Add document summary display — P1, unblocked by P3-006) or **P6-004** (Add important dates API/UI — P1).

## Last Updated

2026-08-21
