# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 5 (Search) — chunk storage done; Phase 3 remainder P1 tasks pending.

## Current Task

**P5-002** (Add embedding provider interface) — implementation complete on task branch `feat/P5-002-embedding-interface`; PR pending human approval.

## Current Branch

`feat/P5-002-embedding-interface`

## Overall Status

`PHASE_5_IN_PROGRESS` — P5-001 (document_chunks + pgvector) and P5-002 (embedding provider abstraction) done; Phase 3 P1 tasks (P3-006/007/009/010) and remaining search/RAG (P5-003→) still pending.

## Last Completed Task

P5-002 (Add embedding provider interface) — `EmbeddingProvider` abstraction + `MockEmbeddingProvider` (deterministic hash, L2-normalized, 1024 dims) + 13 unit tests; 216 tests passing.

## What Is Working

- Everything from Phases 0–2 + P3-001..P5-001 (merged into `main` via PRs #1–#24).
- Embedding provider interface (this PR):
  - **`packages/processing/src/embedding.ts`**: `EmbeddingProvider` contract (`modelName()`, `dimensions()`, `embed(texts: string[]): Promise<number[][]>`) — provider-agnostic (ADR-003/007) for `vector(1024)` chunks (TECHNICAL_SPEC §10, AI_LLM_ARCHITECTURE §7/§18, IMPLEMENTATION_GUIDE §5).
  - **`packages/processing/src/mock-embedding-provider.ts`**: `MockEmbeddingProvider` (deterministic SHA256 hash-expanded, L2-normalized, zero-vector for empty, batch-ordered, `createMockEmbeddingProvider`/`createEmbeddingProvider` factories). Default `mock-bge-m3` 1024 dims (matches DB); validates dimensions, handles empty/batch, factory switchable for P5-003 local adapter.
  - **`packages/processing/src/mock-embedding-provider.test.ts`**: 13 unit tests (modelName/dimensions, vector dims, batch order, determinism, distinctness via cosine <0.99, empty/whitespace zero-vector, empty batch, L2-norm, factory, custom dims).
  - `packages/processing/src/index.ts` re-exports.
- Prior chunk storage (P5-001):
  - **`document_chunks` table** (`vector(1024)` pgvector/pg17) + `DocumentChunksRepository` + 7 integration tests.
- Prior chunking (P3-008):
  - **`packages/processing` chunker** — deterministic, 500/75/700/100, paragraph→sentence→line, page-aware, overlap, Hindi support.
- Prior metadata interface (P3-005):
  - **`MetadataExtractor` contract** with Zod validation, `HeuristicMetadataExtractor` baseline.
- Prior processing orchestration (P3-004):
  - **Worker pipeline**: `document.process` job → tenant-scoped version lookup → download original → text extraction → OCR when inadequate → persist `extracted_text`/`ocr_status`/`page_count`/`processing_status` → write `extracted.txt` artifact (idempotent, tenant-aware, retryable).

## What Is Not Implemented

- Phase 3 remainder: metadata extraction LLM provider (P3-006), date extraction (P3-007), retry/status UI (P3-009), scanned-PDF integration tests (P3-010).
- Search remainder: local embedding adapter (P5-003), generate/store embeddings (P5-004), FTS (P5-005), vector search (P5-006), hybrid (P5-007), search API (P5-009), etc.
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

`main` contains merged Phases 0–2 + P5-001 (PR #24). Task branch `feat/P5-002-embedding-interface` adds the embedding provider abstraction, all checks green:

```text
lint ✅  typecheck ✅ (13/13)  tests ✅ (216, +13 mock embeddings)  build ✅ (8/8)  format ✅  migration ✅ (pgvector)
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
| Unit/integration tests | PASS (216) |
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
| Embedding provider interface (mock, deterministic) | PASS (13) |
| E2E tests | NOT STARTED (Phase 9) |
| Security verification | NOT STARTED |
| Search evaluation | NOT STARTED |
| AI/RAG evaluation | NOT STARTED |

## Next Recommended Action

After P5-002 merges, start **P5-003** (Add local embedding adapter — P0) or **P5-005** (Implement PostgreSQL full-text search — P0) or **P4-001** (Implement review queue API — P0). Phase 3 P1 tasks (P3-006/007) remain P1 and can run in parallel.

## Last Updated

2026-08-19
