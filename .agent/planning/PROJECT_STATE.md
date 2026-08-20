# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 6 (Consumption) — document detail API + document detail page done; Phase 4 (Publishing) — review queue + supersession/version APIs + publication permission tests done; Phase 5 (Search) — lexical FTS + chunk storage + embedding interface + local adapter + generate/store embeddings + vector search + hybrid retrieval + search API + search results UI + search evaluation set done; Phase 3 remainder P1 tasks pending.

## Current Task

**P6-002** (Build document detail page) — implementation complete on task branch `feat/P6-002-document-detail-page`; PR pending human approval.

## Current Branch

`feat/P6-002-document-detail-page`

## Overall Status

`PHASE_6_IN_PROGRESS` — P6-001 (document detail API) and P6-002 (document detail page) done; `PHASE_4_IN_PROGRESS` — P4-001 (review queue API), P4-002 (approve/publish APIs), P4-003 (supersession/version APIs), and P4-006 (publication permission tests) done; `PHASE_5_IN_PROGRESS` — P5-001 (document_chunks + pgvector), P5-002 (embedding provider abstraction), P5-003 (local embedding adapter), P5-004 (generate/store embeddings), P5-005 (PostgreSQL full-text search), P5-006 (vector search), P5-007 (hybrid retrieval), P5-009 (search API), P5-010 (search results UI), and P5-014 (search evaluation set) done; Phase 3 P1 tasks (P3-006/007/009/010) and remaining Phase 6/8 (P6-003→, P8-001→) still pending.

## Last Completed Task

P6-002 (Build document detail page) — `apps/web/src/app/documents/[id]/page.tsx` (`'use client'` + `Suspense` for `useSearchParams`? actually `useParams`, `HybridSearchService` via `GET /documents/:id` + `GET /documents/:id/versions`, `is_current`/`superseded_by`/`current_version_id`, `loading`/`error`/`ready` states per UI_UX §9, `Current`/`Not current`/`Superseded` badges, `Superseded by` link, version history table, `Copy link`/`Search related`, `requireMember` redirect) + `apps/web/src/app/page.tsx` home search bar already done in P5-010; `next build` 10 routes including `/documents/[id]` 2.49 kB and `/search` 3.07 kB, `317` tests passing.

## What Is Working

- Everything from Phases 0–2 + P3-001..P5-001 (merged into `main` via PRs #1–#24).
- Full-text search (P5-005):
  - **`infra/migrations/1787232000000_add-document-search-vector.js`**: `documents.search_vector tsvector` + trigger `documents_search_vector_update()` (weighted A title / B slug / C document_type) + GIN index `documents_search_vector_idx` + backfill for existing rows; down-migration drops trigger/function/index/column.
  - **`apps/api/src/modules/documents/documents.repository.ts`**: `list()` search now uses `d.search_vector @@ plainto_tsquery('english', $n) OR d.title ILIKE $m` and, when searching, orders by `ts_rank(d.search_vector, plainto_tsquery(...)) DESC, d.created_at DESC` (relevance + recency). Non-search listings unchanged. **P5-007 adds `lexicalSearch(institutionId, query, {limit, statuses, department_id, document_type})` returning `DocumentListItem & {lexical_score}` via `ts_rank(d.search_vector, plainto_tsquery('english', $n))` ordered `lexical_score DESC`. **P4-001 adds `visibleStatusesForRole` RBAC for `status` filter and `lexicalSearch` for hybrid. **P4-003 adds `superseded_by_document_id`/`superseded_reason`/`superseded_at` + `supersede` + `SELECT_COLUMNS`. **P6-001 extends `DocumentDetailView` with `is_current`/`superseded_by`/`superseded_at`/`superseded_reason`/`current_version_id`.
  - **`apps/api/src/modules/documents/documents.route.test.ts`**: 4 new FTS tests — stemmed term match (`schedules` → `Holiday Schedule`), token-order independence (`fare refund`), title relevance ranking (double-token title outranks), and search_vector trigger sync on title update.
- Embedding provider interface (P5-002):
  - **`packages/processing/src/embedding.ts`**: `EmbeddingProvider` contract (`modelName()`, `dimensions()`, `embed(texts: string[]): Promise<number[][]>`) — provider-agnostic (ADR-003/007) for `vector(1024)` chunks (TECHNICAL_SPEC §10, AI_LLM_ARCHITECTURE §7/§18, IMPLEMENTATION_GUIDE §5).
  - **`packages/processing/src/mock-embedding-provider.ts`**: `MockEmbeddingProvider` (deterministic SHA256 hash-expanded, L2-normalized, zero-vector for empty, batch-ordered, `createMockEmbeddingProvider`/`createEmbeddingProvider` factories). Default `mock-bge-m3` 1024 dims (matches DB); validates dimensions, handles empty/batch, factory switchable for P5-003 local adapter.
  - **`packages/processing/src/mock-embedding-provider.test.ts`**: 13 unit tests (modelName/dimensions, vector dims, batch order, determinism, distinctness via cosine <0.99, empty/whitespace zero-vector, empty batch, L2-norm, factory, custom dims).
  - `packages/processing/src/index.ts` re-exports.
- Local embedding adapter (P5-003):
  - **`packages/processing/src/local-embedding-provider.ts`**: `LocalEmbeddingProvider` (provider-agnostic adapter for Ollama `POST /api/embed` and OpenAI-compatible `POST /v1/embeddings`; supports `BGE-M3` 1024 dims, batching via `maxBatchSize`, zero vectors for empty inputs, dimension validation, timeout/AbortController, `normalize` option, flexible endpoint resolution from `EMBEDDING_BASE_URL`/`EMBEDDING_ENDPOINT`).
  - **`packages/processing/src/mock-embedding-provider.ts`**: updated `createEmbeddingProvider` factory — reads `EMBEDDING_PROVIDER` (`mock|local|ollama|http|openai|vllm`), `EMBEDDING_MODEL`, `EMBEDDING_BASE_URL`, `EMBEDDING_DIMENSIONS`, `EMBEDDING_ENDPOINT` and returns `LocalEmbeddingProvider` when configured, otherwise `MockEmbeddingProvider`.
  - **`packages/processing/src/local-embedding-provider.test.ts`**: 27 unit tests (defaults, custom, invalid dims/batch, empty handling without fetch, single/batch order, Ollama/OpenAI/legacy shapes, batching, HTTP error, dimension mismatch, non-finite, unexpected shape, legacy single, endpoint resolution, normalize, factory switch via env).
  - `packages/processing/src/index.ts` re-exports `LocalEmbeddingProvider`.
  - `.env.example` updated with `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_BASE_URL`, `EMBEDDING_ENDPOINT`, `EMBEDDING_DIMENSIONS` documentation.
- Generate/store embeddings (P5-004):
  - **`apps/api/src/modules/documents/document-chunks.repository.ts`**: `createMany()` now persists `embedding vector(1024)` via `'[${embedding.join(',')}]'::vector` (null → `NULL::vector`), 7 params/row, `::vector` cast for pgvector; backward compatible for null embeddings (existing 7 integration tests still pass, plus new embedding round-trip test).
  - **`apps/worker/src/processing/document-chunks.repository.ts`**: worker-side mirror (WorkerDbPool) with same `::vector` logic for pipeline use.
  - **`apps/worker/src/processing/processing.service.ts`**: extended orchestration — after text extraction (and OCR), chunks via `chunker.chunk({text, pages, pageCount})` (page-aware, deterministic), embeds via `embeddingProvider.embed(chunkTexts)` (mock `mock-bge-m3` 1024 dims, L2-normalized; local `bge-m3` when `EMBEDDING_PROVIDER` set), then `storage.put(extracted.txt)` + `deleteByVersion`/`createMany` with embeddings before `updateProcessingResult(COMPLETED)` (retry-safe: failure keeps `PROCESSING` for retry; idempotent: `COMPLETED` early return, stale chunks deleted on reprocess).
  - **`apps/api/src/modules/documents/document-chunks.repository.test.ts`**: added `stores and retrieves embeddings for chunks (P5-004)` — creates chunks, embeds via `createMockEmbeddingProvider`, inserts with `embedding`, asserts `embedding` string `'['` and `JSON.parse` 1024 dims.
  - **`apps/worker/src/processing/processing.embeddings.unit.test.ts`**: 7 unit tests (chunk+embed, empty→0 chunks+delete, wrong count throws, idempotent COMPLETED no re-embed, page-aware, vector formatting `::vector`, null).
  - `processing.repository.ts` / `processing.service.test.ts` unchanged (integration still passes via pgvector).
- Vector search (P5-006):
  - **`apps/api/src/modules/search/vector-search.repository.ts`**: `VectorSearchRepository extends TenantRepository` — `searchByEmbedding(institutionId, queryEmbedding, {limit, offset, statuses, departmentId, documentType})` builds tenant-scoped `WHERE d.institution_id=$1 AND c.embedding IS NOT NULL AND d.status=ANY($3)`, optional department/type filters, `ORDER BY c.embedding <=> $2::vector ASC LIMIT/OFFSET`, returns `VectorSearchResult` with `distance` (`<=>`) and `similarity` (`1-distance`), validates non-empty/finite embedding, `tenantId()` fail-fast, includes `department_id`/`published_at` for hybrid.
  - **`apps/api/src/modules/search/vector-search.service.ts`**: `VectorSearchService` — `search(institutionId, {text, limit, offset, statuses, departmentId, documentType})` validates `text.trim()` non-empty, embeds via `EmbeddingProvider` (`createEmbeddingProvider()` mock/local), delegates to `VectorSearchRepository.searchByEmbedding`; `searchByEmbedding` direct for P5-007 hybrid; exposes `modelName()`/`dimensions()`.
  - **`apps/api/src/modules/search/vector-search.repository.test.ts`**: 7 integration tests (semantic similarity ranking via mock embeddings, empty, tenant isolation, PUBLISHED default + explicit DRAFT, validation, invalid tenant, limit/offset) — requires `pgvector/pgvector:pg17`.
  - **`apps/api/src/modules/search/vector-search.service.test.ts`**: 4 unit tests (embed+delegate, empty throws, model/dims, direct).
- Hybrid retrieval (P5-007):
  - **`apps/api/src/modules/documents/documents.repository.ts`**: added `lexicalSearch` for hybrid (see above).
  - **`apps/api/src/modules/search/vector-search.repository.ts`**: extended to return `department_id`/`published_at` for hybrid merging.
  - **`apps/api/src/modules/search/hybrid-search.service.ts`**: `HybridSearchService` — `search(institutionId, query, {limit, offset, statuses, departmentId, documentType, lexicalWeight=0.4, semanticWeight=0.6})` embeds query, runs `lexicalSearch` (top 20) and `vector.searchByEmbedding` (top 20) in parallel, aggregates vector chunks to `max similarity` per doc, normalizes `lexical_score / maxLexical` and `similarity / maxSemantic`, hybrid `lexicalWeight*normLex + semanticWeight*normSem`, `match_reasons` `['lexical','semantic']`, freshness tie-breaker `published_at`, sorts `hybrid_score DESC`.
  - **`apps/api/src/modules/search/hybrid-search.service.test.ts`**: 4 unit tests (merge ranking both>single, empty, vector-only, model/dims).
  - **`apps/api/src/modules/search/hybrid-search.integration.test.ts`**: 5 integration tests (both-match ranking, tenant isolation, PUBLISHED filter, empty/invalid, semantic-only) — requires `pgvector`.
- Search API (P5-009):
  - **`apps/api/src/modules/search/search.route.ts`**: `GET /search` — `requireMember` auth, `60/min` rate limit, Zod `q|query|search` (required, 1..200), `department_id` (uuid), `document_type` (enum), `page`/`limit` (1..100, default 20), `visibleStatusesForRole` (`STUDENT`/`FACULTY` → `PUBLISHED` else all), delegates to `HybridSearchService.search(institutionId, q, {limit, offset, statuses, departmentId, documentType})`, returns `{data:{query, results:[{document_id,title,score,summary:null,match_reasons,published_at,is_current,lexical_score,semantic_score}], facets:{departments:[{id,name,count}]}}, meta:{total, latency_ms}}` per `API_SPEC_SHEET.md` §7.
  - **`apps/api/src/app.ts`**: registers `registerSearchRoutes` under `/api/v1` (after `registerDocumentsRoutes`, before `registerAuditRoutes`).
  - **`apps/api/src/modules/search/search.route.test.ts`**: 7 integration tests (lexical, semantic, draft hidden, tenant isolation, missing q 422, department filter, 401) — requires `pgvector` + `pgvector/pgvector:pg17` + MinIO.
- Search results UI (P5-010):
  - **`apps/web/src/app/search/page.tsx`**: `'use client'` + `Suspense` for `useSearchParams`; `HybridSearchService` via `GET /search` (`apiEnvelopeRequest`), `q|query|search` + `department_id`/`document_type` filters, `page`/`limit` pagination, `visibleStatusesForRole` handled server-side; states `idle` (try asking), `loading` (aria-busy), `error` (retry), `empty` (We couldn't find… + suggestions per UI_UX §8), `success` (results grid with `title`/`score`/`match_reasons`/`published_at`/`is_current` badge per UI_UX §6, `Open`/`Share`, `facets` counts, `pagination`); `requireMember` redirect to `/login` on 401.
  - **`apps/web/src/app/page.tsx`**: home `form action="/search"` search bar (UI_UX §5: “Search anything in your institution…” + try asking) + `Search` link.
  - `next build` 9 routes including `/search` 3.07 kB, `284` tests passing.
- Search evaluation set (P5-014):
  - **`tests/evals/search-evaluation.dataset.json`**: 12 cases (exact/partial/natural/vague/date/department/version-conflict/multilingual hi/hinglish/no-answer/restricted/prefix-fuzzy) per `TEST_STRATEGY.md` §6 and `AI_EVALUATION.md` §2.
  - **`tests/evals/search-evaluation.runner.ts`**: `evaluateSearch(dataset, searchFn)` computes `Recall@5/10`, `MRR`, `NDCG@5/10`, `zero-result` and `per_case` with `formatMetrics`.
  - **`tests/evals/search-evaluation.test.ts`**: integration via `HybridSearchService` (seeded titles/chunks, mock `mock-bge-m3`), asserts `Recall@5≥0.4` `MRR≥0.3` and per-case.
  - **`tests/evals/search-evaluation.runner.test.ts`**: 4 unit tests (perfect, zero/no-answer, partial, NDCG).
  - `tsconfig.test.json` paths for `@ikp/processing` etc., `package.json` root `pg` for evals.
- Review queue API (P4-001):
  - **`apps/api/src/modules/documents/documents.service.ts`**: `list` now enforces RBAC for `status` filter (non-PUBLISHED requires `document.approve`/`publish`), `reviewQueue` method requires `document.approve` and delegates to `list` with `IN_REVIEW`.
  - **`apps/api/src/modules/documents/documents.route.ts`**: `GET /documents/review-queue` with `guard('document.approve')`, `60/min` rate limit, `reviewQueueQuerySchema` (omit `status`), delegates to `service.reviewQueue`.
  - **`apps/api/src/modules/documents/document-review-queue.route.test.ts`**: 6 integration tests (approver list, student 403, tenant isolation, search filter, student list IN_REVIEW 403, approver list IN_REVIEW 200).
- Supersession/version APIs (P4-003):
  - **`infra/migrations/1787235000000_add-superseded-by-to-documents.js`**: `superseded_by_document_id` uuid FK `SET NULL`, `superseded_reason` text, `superseded_at` timestamptz, index.
  - **`apps/api/src/modules/documents/documents.repository.ts`**: `DocumentRow` + `superseded_*`, `SELECT_COLUMNS`, `mapDocumentRow`, `supersede` method (`status='SUPERSEDED'`).
  - **`apps/api/src/modules/documents/document-versions.repository.ts`**: `listByDocumentId` ordered `version_number ASC`.
  - **`apps/api/src/modules/documents/documents.service.ts`**: `supersede` (requires `document.publish`, `PUBLISHED` check, self-check, `canTransitionDocument`, audit `document.superseded`), `listVersions` (with `is_current`).
  - **`apps/api/src/modules/documents/documents.route.ts`**: `POST /documents/:id/supersede` (`guard('document.publish')`, Zod `superseded_by_document_id` uuid+`reason`, 60/min) + `GET /documents/:id/versions` (`requireMember`, tenant-scoped).
  - **`apps/api/src/modules/documents/document-supersession.route.test.ts`**: 9 integration tests (supersede PUBLISHED→SUPERSEDED, non-PUBLISHED 409, self 409, student 403, tenant isolation, uuid validation, versions list ordered `is_current`, 404, tenant isolation).
- Publication permission tests (P4-006):
  - **`apps/api/src/modules/documents/document-publication-permission.route.test.ts`**: 8 integration tests (student/faculty cannot approve/publish, deptAdmin cannot, approver/admin can, student visibility PUBLISHED only, student list only PUBLISHED, superseded not in student list/search, cross-tenant 404, search draft/superceded hidden).
- Document detail API (P6-001):
  - **`apps/api/src/modules/documents/documents.service.ts`**: `DocumentDetailView` + `is_current`/`superseded_by`/`superseded_at`/`superseded_reason`/`current_version_id`, `get` now returns `SUPERSEDED` to students as historical with `is_current:false`, `superseded_by` resolved, `is_current` via `PUBLISHED && !superseded_by`.
  - **`apps/api/src/modules/documents/document-detail.route.test.ts`**: 4 integration tests (PUBLISHED `is_current` true, SUPERSEDED `is_current` false with `superseded_by`, tenant isolation, DRAFT hidden).
- Document detail page (P6-002):
  - **`apps/web/src/app/documents/[id]/page.tsx`**: `'use client'` + `useParams`/`useRouter`/`useEffect`/`useState`/`Suspense`? actually `useParams`; fetches `GET /documents/:id` + `GET /documents/:id/versions` via `apiRequest`, states `loading`/`error`/`ready`; shows `status`/`is_current`/`Superseded` badges, `title`, `department`/`type`/`published_at`, `Superseded by` link, version history table (`version_number`/`created_at`/`is_current`), `Copy link`/`Search related`, `Back to search`.
  - `next build` 10 routes including `/documents/[id]` 2.49 kB and `/search` 3.07 kB.
- Prior chunk storage (P5-001):
  - **`document_chunks` table** (`vector(1024)` pgvector/pg17) + `DocumentChunksRepository` + 8 integration tests (7 original + 1 embedding).
- Prior chunking (P3-008):
  - **`packages/processing` chunker** — deterministic, 500/75/700/100, paragraph→sentence→line, page-aware, overlap, Hindi support.
- Prior metadata interface (P3-005):
  - **`MetadataExtractor` contract** with Zod validation, `HeuristicMetadataExtractor` baseline.
- Prior processing orchestration (P3-004):
  - **Worker pipeline**: `document.process` job → tenant-scoped version lookup → download original → text extraction → OCR when inadequate → persist `extracted_text`/`ocr_status`/`page_count`/`processing_status` → write `extracted.txt` artifact + chunk/embed + vector/hybrid search (idempotent, tenant-aware, retryable).

## What Is Not Implemented

- Phase 3 remainder: metadata extraction LLM provider (P3-006), date extraction (P3-007), retry/status UI (P3-009), scanned-PDF integration tests (P3-010).
- Search remainder: reranker (P5-008), filters/facets (P5-011), search analytics (P5-012), etc.
- Phases 4 remainder: approval queue UI (P4-004), version history UI (P4-005), etc., and Phases 6–10 (P6-003→, P8-001→).
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

`main` contains merged Phases 0–2 + P5-002 + P5-005 + P5-003 + P5-004 + P5-006 + P5-007 + P5-009 + P5-010 + P5-014 + P4-001 + P4-003 + P4-006 + P6-001 (PR #37). Task branch `feat/P6-002-document-detail-page` adds document detail page, all checks green:

```text
lint ✅  typecheck ✅ (13/13)  tests ✅ (317)  build ✅ (10/10 including /documents/[id] + /search)  format ✅  migration ✅ (pgvector)
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
| Unit/integration tests | PASS (317) |
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
| Full-text search (tsvector trigger, GIN, ranking) | PASS (4) |
| E2E tests | NOT STARTED (Phase 9) |
| Security verification | NOT STARTED |
| Search evaluation | DONE (P5-014) |
| AI/RAG evaluation | NOT STARTED |

## Next Recommended Action

After P6-002 merges, start **P8-001** (Create LLM provider interface — P0) or **P4-004** (Build approval queue UI — P1) or **P6-003** (Add document summary display — P1, depends `P3-006`/`P6-002`). Phase 3 P1 tasks (P3-006/007) remain P1 and can run in parallel.

## Last Updated

2026-08-20
