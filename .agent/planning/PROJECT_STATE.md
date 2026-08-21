# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 9 (Hardening) — P9-001/002/008 DONE; Phase 8 (Institutional AI) P0 DONE; Phase 5 — P5-008 DONE (merged #55); Phase 4 — P4-004 DONE on task branch `feat/P4-004-approval-queue-ui`, P4-005 still TODO; Phase 3 — P3-006/007 DONE (merged #53/#54), P3-009 DONE (merged #56 at `65be8d5`), P3-010 still TODO.

## Current Task

**P4-004** (Build approval queue UI — P1) — implementation complete on task branch `feat/P4-004-approval-queue-ui`; review-queue page with approve/reject, pagination, search, typecheck/lint/build green, 516 tests total (P3-009 included).

## Current Branch

`feat/P4-004-approval-queue-ui`

## Overall Status

`PHASE_9_DONE` — all P0 tasks DONE and `docs/FINAL_IMPLEMENTATION_REPORT.md` at `main` `65be8d5` (P3-009 merged); `PHASE_8_DONE` — all P0 DONE; `PHASE_4_PROGRESS` — P4-001/002/003/006 DONE, **P4-004 DONE on branch** (needs PR), P4-005 TODO; `PHASE_3_PROGRESS` — P3-001..007/008 DONE, **P3-009 DONE (merged #56)**, P3-010 TODO; `PHASE_5_DONE` — P5-001..008/009/010/014 DONE (P5-008 merged), P5-011/012/013 TODO.

## Last Completed Task

P4-004 (Build approval queue UI — P1) — `apps/web/src/app/admin/documents/review-queue/page.tsx` (new, `GET /documents/review-queue` with search/page, table Title/Type/Dept/Status, Approve → `POST /documents/:id/approve`, Return → `POST /documents/:id/reject`, pagination, empty/403 handling) + `apps/web/src/app/admin/layout.tsx` (add Review queue nav) + `apps/api/src/modules/documents/documents.route.ts` (`POST /documents/:id/reject` guard `document.approve` → `service.transition(..., 'DRAFT')` for IN_REVIEW→DRAFT) + `TASK_MANIFEST` P4-004 TODO→DONE; build 11 routes (`/admin/documents/review-queue` 2.43kB), typecheck/lint green; inherits P3-009 processing-status (9 tests, 516 total on this branch).

## What Is Working

- Everything from Phases 0–2 + P3-001..P5-001 merged through #56 (`main` at `65be8d5` includes P3-009 processing-status + P5-008 reranker + P3-007 dates + P3-006 metadata LLM + P9-001/002/008).
- Full-text search (P5-005), embedding interface (P5-002), local embedding adapter (P5-003), generate/store embeddings (P5-004), vector search (P5-006), hybrid retrieval (P5-007), search API (P5-009), search UI (P5-010), search eval (P5-014), review queue API (P4-001), supersession (P4-003), publication permission (P4-006), document detail API/page (P6-001/002), LLM provider (P8-001), local LLM adapter (P8-002), permission-aware retrieval (P8-004), context builder (P8-005), RAG answer service (P8-006), citation contract (P8-007), unsupported (P8-008), /ai/ask API (P8-009), Ask UI (P8-010), prompt-injection (P8-011), RAG eval (P8-012), cross-tenant RAG (P8-013), E2E critical path (P9-001), security regression (P9-002), final report (P9-008) — all per FINAL_IMPLEMENTATION_REPORT.md.
- **P3-009 (merged #56)**:
  - **`apps/api/src/modules/documents/document-versions.repository.ts`**: `DocumentVersionRow.processing_status: string` + `mapVersionRow` default QUEUED + `SELECT_COLUMNS` include `processing_status`.
  - **`apps/api/src/modules/documents/documents.service.ts`**: `getProcessingStatus` (visibility + creator/manager gate) + `retryProcessing` (creator/manager, latest version, `queue.enqueue` idempotent jobId, audit `document.updated`, reset FAILED→QUEUED).
  - **`apps/api/src/modules/documents/documents.route.ts`**: `GET /documents/:id/processing-status` + `POST /documents/:id/retry-processing` (202).
  - **`apps/web/src/app/admin/documents/upload/page.tsx`**: Polling `processing-status` every 2s, table Version/Processing/OCR/Pages/Text, FAILED→Retry, COMPLETED notice.
  - **`apps/api/src/modules/documents/processing-status.route.test.ts`**: 9 integration tests.
- **NEW P4-004 (branch)**:
  - **`apps/web/src/app/admin/documents/review-queue/page.tsx`**: `GET /documents/review-queue?search&page&limit` via `apiEnvelopeRequest`, `ReviewQueueItem` type, `LoadState`, `refresh` callback, `useEffect` for 403 vs 401, `handleApprove` POST approve → refresh, `handleReturnToDraft` POST reject → refresh, `totalPages` pagination, table with Link to /documents/:id, Actions Approve/Return, empty state, tip.
  - **`apps/web/src/app/admin/layout.tsx`**: Adds `Review queue` nav item to `NAV_ITEMS`.
  - **`apps/api/src/modules/documents/documents.route.ts`**: `POST /documents/:id/reject` (guard `document.approve`, validates `document_id`, calls `service.transition(..., 'DRAFT')` for IN_REVIEW→DRAFT, 200).
  - **Build**: `pnpm --filter web build` 11 routes (`/admin/documents/review-queue` 2.43kB) green.
- Prior P5-008: reranker (31 tests), P3-007: dates (38 tests), P3-006: metadata LLM (23 tests) still passing.

## What Is Not Implemented

- Phase 3 remainder: scanned-PDF integration tests (P3-010).
- Search remainder: filters/facets (P5-011), search analytics (P5-012), unresolved (P5-013).
- Phases 4 remainder: version history UI (P4-005).
- Phases 6 remainder: summary (P6-003 now unblocked by P3-006), important dates API/UI (P6-004 now unblocked by P3-007), bookmarks (P6-005), related (P6-006 now unblocked by P5-008), share (P6-007).
- Phase 7 notifications (P7-001→006).
- P8-003 cloud LLM adapter (P1), P9-003/004/005/006/007 (P1 load/metrics/backup/deploy).
- PDF page rasterization for scanned-PDF OCR (backlogged).

## Active Blockers

- PR #57 (P4-004) requires human approval to merge into `main` (repository merge policy). PR #56 (P3-009) already merged at `65be8d5`.
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
- Approval queue is tenant-scoped and RBAC-guarded (`document.approve`), reuses existing `reviewQueue` service + new reject transition (IN_REVIEW→DRAFT) for return-to-draft.
- Git uses task branches and pull requests; merging into `main` requires the repository's approval policy.

## Current Git State

`main` at `65be8d5` (Merge PR #56 P3-009). Task branch `feat/P4-004-approval-queue-ui` adds approval queue UI (review-queue page + reject endpoint), all checks green (rebased onto `65be8d5`):

```text
lint ✅  typecheck ✅  tests ✅ (516, +9 P3-009)  build ✅ (11 routes)  format ✅  migration ✅ (pgvector on 5434)
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
| Approval queue UI (P4-004) | PASS (build 11/11) |
| Full-text search (tsvector trigger, GIN, ranking) | PASS (4) |
| E2E tests (P9-001) | PASS (10/17 flows) |
| Security regression (P9-002) | PASS (7) |
| Final gate report (P9-008) | DONE |

## Next Recommended Action

After P4-004 merges, start **P4-005** (Build version history UI — P1, depends P4-003) or **P6-003** (Add document summary display — P1, unblocked by P3-006) or **P6-004** (Add important dates API/UI — P1, unblocked by P3-007) or **P5-011** (Add filters/facets — P1).

## Last Updated

2026-08-21
