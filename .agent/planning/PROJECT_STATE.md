# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 5 (Search) — lexical FTS + chunk storage + embedding interface + local adapter + generate/store embeddings + vector search done; Phase 3 remainder P1 tasks pending.

## Current Task

**P5-006** (Implement vector search) — implementation complete on task branch `feat/P5-006-vector-search`; PR pending human approval.

## Current Branch

`feat/P5-006-vector-search`

## Overall Status

`PHASE_5_IN_PROGRESS` — P5-001 (document_chunks + pgvector), P5-002 (embedding provider abstraction), P5-003 (local embedding adapter), P5-004 (generate/store embeddings), P5-005 (PostgreSQL full-text search), and P5-006 (vector search) done; Phase 3 P1 tasks (P3-006/007/009/010) and remaining search/RAG (P5-007→) still pending.

## Last Completed Task

P5-006 (Implement vector search) — `apps/api/src/modules/search/vector-search.repository.ts` (pgvector cosine `embedding <=> $2::vector`, tenant-scoped `documents.institution_id`, `PUBLISHED` default, `::vector` cast, limit/offset, distance/similarity) + `vector-search.service.ts` (query `text` → `EmbeddingProvider.embed` → repository, `searchByEmbedding` direct) + `vector-search.repository.test.ts` 7 integration tests (semantic similarity ranking, empty, tenant isolation, status filter, validation, limit/offset) + `vector-search.service.test.ts` 4 unit tests (embed+delegate, empty, model/dims, direct); 266 tests passing.

## What Is Working

- Everything from Phases 0–2 + P3-001..P5-001 (merged into `main` via PRs #1–#24).
- Full-text search (P5-005):
  - **`infra/migrations/1787232000000_add-document-search-vector.js`**: `documents.search_vector tsvector` + trigger `documents_search_vector_update()` (weighted A title / B slug / C document_type) + GIN index `documents_search_vector_idx` + backfill for existing rows; down-migration drops trigger/function/index/column.
  - **`apps/api/src/modules/documents/documents.repository.ts`**: `list()` search now uses `d.search_vector @@ plainto_tsquery('english', $n) OR d.title ILIKE $m` and, when searching, orders by `ts_rank(d.search_vector, plainto_tsquery(...)) DESC, d.created_at DESC` (relevance + recency). Non-search listings unchanged.
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
  - **`apps/api/src/modules/search/vector-search.repository.ts`**: `VectorSearchRepository extends TenantRepository` — `searchByEmbedding(institutionId, queryEmbedding, {limit, offset, statuses, departmentId, documentType})` builds tenant-scoped `WHERE d.institution_id=$1 AND c.embedding IS NOT NULL AND d.status=ANY($3)`, optional department/type filters, `ORDER BY c.embedding <=> $2::vector ASC LIMIT/OFFSET`, returns `VectorSearchResult` with `distance` (`<=>`) and `similarity` (`1-distance`), validates non-empty/finite embedding, `tenantId()` fail-fast.
  - **`apps/api/src/modules/search/vector-search.service.ts`**: `VectorSearchService` — `search(institutionId, {text, limit, offset, statuses, departmentId, documentType})` validates `text.trim()`, embeds via `EmbeddingProvider` (`createEmbeddingProvider()` mock/local), delegates to repository; `searchByEmbedding` direct for P5-007 hybrid; exposes `modelName()`/`dimensions()`.
  - **`apps/api/src/modules/search/vector-search.repository.test.ts`**: 7 integration tests (semantic similarity ranking via mock embeddings, empty, tenant isolation, PUBLISHED default + explicit DRAFT, validation, invalid tenant, limit/offset) — requires `pgvector/pgvector:pg17`.
  - **`apps/api/src/modules/search/vector-search.service.test.ts`**: 4 unit tests (embed+delegate, empty throws, model/dims, direct).
- Prior chunk storage (P5-001):
  - **`document_chunks` table** (`vector(1024)` pgvector/pg17) + `DocumentChunksRepository` + 8 integration tests (7 original + 1 embedding).
- Prior chunking (P3-008):
  - **`packages/processing` chunker** — deterministic, 500/75/700/100, paragraph→sentence→line, page-aware, overlap, Hindi support.
- Prior metadata interface (P3-005):
  - **`MetadataExtractor` contract** with Zod validation, `HeuristicMetadataExtractor` baseline.
- Prior processing orchestration (P3-004):
  - **Worker pipeline**: `document.process` job → tenant-scoped version lookup → download original → text extraction → OCR when inadequate → persist `extracted_text`/`ocr_status`/`page_count`/`processing_status` → write `extracted.txt` artifact + chunk/embed + vector search (idempotent, tenant-aware, retryable).

## What Is Not Implemented

- Phase 3 remainder: metadata extraction LLM provider (P3-006), date extraction (P3-007), retry/status UI (P3-009), scanned-PDF integration tests (P3-010).
- Search remainder: hybrid (P5-007), search API (P5-009), etc.
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

`main` contains merged Phases 0–2 + P5-002 + P5-005 + P5-003 + P5-004 (PR #28). Task branch `feat/P5-006-vector-search` adds vector search, all checks green:

```text
lint ✅  typecheck ✅ (13/13)  tests ✅ (266, +11 vector search)  build ✅ (8/8)  format ✅  migration ✅ (pgvector)
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
| Unit/integration tests | PASS (266) |
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
| Full-text search (tsvector trigger, GIN, ranking) | PASS (4) |
| E2E tests | NOT STARTED (Phase 9) |
| Security verification | NOT STARTED |
| Search evaluation | NOT STARTED |
| AI/RAG evaluation | NOT STARTED |

## Next Recommended Action

After P5-006 merges, start **P5-007** (Implement hybrid retrieval — P0) or **P4-001** (Implement review queue API — P0) or **P4-003** (Implement supersession/version APIs — P0). Phase 3 P1 tasks (P3-006/007) remain P1 and can run in parallel.

## Last Updated

2026-08-20
