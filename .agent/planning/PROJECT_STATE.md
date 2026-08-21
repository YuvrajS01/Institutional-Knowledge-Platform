# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 9 (Hardening) — P9-001/002/008 DONE; Phase 8 (Institutional AI) P0 DONE; Phase 6 — P6-003 DONE (merged #58 at `ea0dbc6`), P6-004 DONE on task branch `feat/P6-004-important-dates`, P6-005/006/007 still TODO; Phase 4 — P4-004 DONE (merged #57), P4-005 TODO; Phase 3 — P3-006/007 DONE (merged #53/#54), P3-009 DONE (merged #56), P3-010 TODO.

## Current Task

**P6-004** (Add important dates API/UI — P1) — implementation complete on task branch `feat/P6-004-important-dates`; extracted_dates persisted via processing pipeline, GET /dates API with filters, dates page + detail card, 5 API tests passing, typecheck/lint/build green, 524 tests total.

## Current Branch

`feat/P6-004-important-dates`

## Overall Status

`PHASE_9_DONE` — all P0 tasks DONE and `docs/FINAL_IMPLEMENTATION_REPORT.md` at `main` `ea0dbc6` (P6-003 merged); `PHASE_8_DONE` — all P0 DONE; `PHASE_6_PROGRESS` — P6-001/002/003 DONE, **P6-004 DONE on branch** (needs PR), P6-005/006/007 TODO; `PHASE_4_PROGRESS` — P4-001/002/003/006 DONE, **P4-004 DONE (merged #57)**, P4-005 TODO; `PHASE_3_PROGRESS` — P3-001..007/008 DONE, **P3-009 DONE (merged #56)**, P3-010 TODO.

## Last Completed Task

P6-004 (Add important dates API/UI — P1) — `apps/api/src/modules/documents/document-metadata.repository.ts` (add `extracted_dates` to Row/Create/Update/Find, JSONB `[]` default) + `apps/api/src/modules/dates/dates.service.ts` (new, `list(institutionId, {from,to,department_id,course,semester,page,limit})` queries published docs with `extracted_dates` JSONB, flattens, filters by from/to, sorts by date, paginates) + `apps/api/src/modules/dates/dates.route.ts` (new, `GET /dates` requireMember, Zod from/to/department/course/semester/page/limit, tenant via `request.institution.id`) + `apps/api/src/app.ts` (registerDatesRoutes) + `apps/worker/src/processing/processing.service.ts` (import `createDateExtractor`, `dateExtractor` field, after chunking extract dates via `dateExtractor.extract({text, filename, mimeType})` → `extractedDates` array with raw/isoDate/label/type/context/confidence, `UPDATE document_metadata SET extracted_dates = $2::jsonb`) + `apps/api/src/modules/documents/documents.service.ts` (add `extracted_dates` to `DocumentDetailView.metadata`, `get()` returns `extracted_dates` from metadata) + `apps/web/src/app/documents/[id]/page.tsx` (add `extracted_dates` to `DocumentDetail`, Important dates card table Date/Label/Type/Raw or placeholder with link to /dates) + `apps/web/src/app/dates/page.tsx` (new, `GET /dates` with from/to filters, cards with date/type/label/context/source link, pagination) + `apps/web/src/app/page.tsx` (add Important dates link) + `apps/api/src/modules/dates/dates.route.test.ts` 5 integration tests (empty, returns for published doc with dates, filters from/to, tenant isolation, 401) + `TASK_MANIFEST` P6-004 TODO→DONE; build 12 routes (`/dates` 2.42kB, `/documents/[id]` 2.85kB), 524 tests passing (+5), typecheck/lint green; pgvector on 5434.

## What Is Working

- Everything from Phases 0–2 + P3-001..P5-001 merged through #58 (`main` at `ea0dbc6` includes P6-003 summary + P4-004 approval queue + P3-009 processing-status + P5-008 reranker + P3-007 dates + P3-006 metadata LLM + P9-001/002/008).
- Full-text search (P5-005), embedding interface (P5-002), local embedding adapter (P5-003), generate/store embeddings (P5-004), vector search (P5-006), hybrid retrieval (P5-007), search API (P5-009), search UI (P5-010), search eval (P5-014), review queue API (P4-001), supersession (P4-003), publication permission (P4-006), document detail API/page (P6-001/002/003), LLM provider (P8-001), local LLM adapter (P8-002), permission-aware retrieval (P8-004), context builder (P8-005), RAG answer service (P8-006), citation contract (P8-007), unsupported (P8-008), /ai/ask API (P8-009), Ask UI (P8-010), prompt-injection (P8-011), RAG eval (P8-012), cross-tenant RAG (P8-013), E2E critical path (P9-001), security regression (P9-002), final report (P9-008) — all per FINAL_IMPLEMENTATION_REPORT.md.
- **P6-003 (merged #58)**: summary via `extractSummary` heuristic + metadata extra, detail + 3 tests.
- **NEW P6-004 (branch)**:
  - **`apps/api/src/modules/documents/document-metadata.repository.ts`**: Extends `DocumentMetadataRow`/`UpdateInput` with `extracted_dates`, `create` inserts `tags`/`extracted_dates` JSONB, `update` handles `extracted_dates`, `findByDocumentId` selects `extracted_dates`.
  - **`apps/api/src/modules/dates/dates.service.ts`**: `list()` builds conditions array dynamically for `department_id`/`course`/`semester`, queries `documents JOIN document_metadata` where `PUBLISHED` and `jsonb_array_length(extracted_dates)>0`, flattens entries (raw/isoDate/label/type/context), filters from/to in JS, sorts by date asc, paginates, returns `{data, total}`.
  - **`apps/api/src/modules/dates/dates.route.ts`**: `GET /dates` (requireMember, 300/min, Zod validation, `institutionId` from `request.institution.id`).
  - **`apps/api/src/app.ts`**: Registers `registerDatesRoutes`.
  - **`apps/worker/src/processing/processing.service.ts`**: Adds `dateExtractor` (createDateExtractor), after chunking extracts dates (trimmed text, filename, mimeType) → `extractedDates` with raw/isoDate/label/type/context/confidence, `UPDATE document_metadata SET extracted_dates = $2::jsonb` best-effort.
  - **`apps/api/src/modules/documents/documents.service.ts`**: Adds `extracted_dates` to `DocumentDetailView.metadata` and returns it from `get()`.
  - **`apps/web/src/app/documents/[id]/page.tsx`**: Adds `extracted_dates` to `DocumentDetail`, renders Important dates card table (Date/Label/Type/Raw) or placeholder with link to /dates.
  - **`apps/web/src/app/dates/page.tsx`**: New, fetches `GET /dates?from&to&page&limit`, `ImportantDate` type, `LoadState`, `fetchDates` via `apiEnvelopeRequest`, `useEffect` 401→login, `applyFilters` with Clear, grid of cards (title, date, type/label, context, raw, source link), pagination.
  - **`apps/web/src/app/page.tsx`**: Adds `Important dates` link to home.
  - **`apps/api/src/modules/dates/dates.route.test.ts`**: 5 integration (pgvector:pg17, S3): empty, returns for published doc with dates, filters from/to, tenant isolation, 401.
  - **Build**: `pnpm --filter web build` 12 routes (`/dates` 2.42kB, `/documents/[id]` 2.85kB) green.
- Prior P5-008: reranker (31 tests), P3-007: dates (38), P3-006: metadata (23).

## What Is Not Implemented

- Phase 3 remainder: scanned-PDF integration tests (P3-010).
- Search remainder: filters/facets (P5-011), search analytics (P5-012), unresolved (P5-013).
- Phases 4 remainder: version history UI (P4-005).
- Phases 6 remainder: bookmarks (P6-005), related (P6-006 now unblocked by P5-008), share (P6-007).
- Phase 7 notifications (P7-001→006).
- P8-003 cloud LLM adapter (P1), P9-003/004/005/006/007 (P1 load/metrics/backup/deploy).
- PDF page rasterization for scanned-PDF OCR (backlogged).

## Active Blockers

- PR for P6-004 requires human approval to merge into `main` (repository merge policy).
- Host Postgres (18.6 on 5432) lacks `pgvector` — use docker `pgvector/pgvector:pg17` on 5434 (`DATABASE_URL=postgresql://postgres:postgres@localhost:5434/institutional_knowledge`) and `REDIS_URL=redis://localhost:6379`; CI green. Host docker compose postgres fails to bind 5432 when host postgres running — use `ikp-pgvector-test-5434`.

## Important Decisions

- **Working product title:** Institutional Knowledge Platform.
- Final commercial branding is intentionally deferred until MVP validation.
- Technical identifiers remain product-name agnostic (`@ikp/*` package scope).
- Stack: pnpm workspace; Fastify (API); Next.js (web); Vitest; ESLint flat config; Prettier; node-pg-migrate; PostgreSQL/pgvector (pgvector/pg17, `vector(1024)` for BGE-M3 1024 dims); Redis; MinIO (S3-compatible).
- API and worker use distinct port variables (`API_PORT`, `WORKER_PORT`) because they share the repo `.env`.
- Migrations are CommonJS `.js` files under `infra/migrations/`; ESLint flat config declares CJS globals for that directory.
- AI providers remain replaceable via adapters; `METADATA_PROVIDER`/`DATE_PROVIDER`/`RERANKER_PROVIDER` mirror `EMBEDDING_PROVIDER`/`LLM_PROVIDER` (ADR-003 local-first).
- Important dates are stored per-document in `document_metadata.extracted_dates` JSONB and exposed via tenant-scoped `GET /dates` (filters from/to/department/course/semester, sorted by date asc).
- Git uses task branches and pull requests; merging into `main` requires the repository's approval policy.

## Current Git State

`main` at `ea0dbc6` (Merge PR #58 P6-003). Task branch `feat/P6-004-important-dates` adds important dates API/UI (dates service + route + processing persistence + frontend), all checks green:

```text
lint ✅  typecheck ✅  tests ✅ (524, +5)  build ✅ (12 routes, /dates 2.42kB)  format ✅  migration ✅ (pgvector on 5434)
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
| Unit/integration tests | PASS (524) |
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
| Document detail API (PUBLISHED/SUPERSEDED, is_current) | PASS (4 + 3 summary) |
| Document detail page (is_current, superseded_by, versions, summary, dates) | PASS (build 12/12, 2.85kB) |
| Important dates API (GET /dates) | PASS (5) |
| Important dates UI (dates page + detail card) | PASS (build 12/12, /dates 2.42kB) |
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

After P6-004 merges, start **P6-005** (Add bookmarks — P1, depends P6-001) or **P5-011** (Add filters/facets — P1) or **P4-005** (Build version history UI — P1) or **P6-006** (Add related documents — P1, now unblocked by P5-008).

## Last Updated

2026-08-21
