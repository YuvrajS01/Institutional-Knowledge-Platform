# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 9 (Hardening) — P9-001/002/008 DONE; Phase 8 (Institutional AI) P0 DONE; Phase 5 — P5-008 DONE on task branch `feat/P5-008-reranker`; Phase 3 — P3-006/007 DONE (merged #53/#54), P3-009/010 still TODO.

## Current Task

**P5-008** (Implement reranker interface/adapter — P1) — implementation complete on task branch `feat/P5-008-reranker`; 31 unit tests (Mock 16 + Local 15) passing, typecheck/lint/build green, 507 tests total.

## Current Branch

`feat/P5-008-reranker`

## Overall Status

`PHASE_9_DONE` — all P0 tasks DONE and `docs/FINAL_IMPLEMENTATION_REPORT.md` at `main` `f0a2c01` (P3-007 merged); `PHASE_8_DONE` — all P0 DONE; `PHASE_5_PROGRESS` — P5-001..007/009/010/014 DONE, **P5-008 DONE on branch** (needs PR), P5-011/012/013 TODO; `PHASE_3_PROGRESS` — P3-001..007/008 DONE, P3-009/010 TODO.

## Last Completed Task

P5-008 (Implement reranker interface/adapter — P1) — `packages/processing/src/reranker.ts` (`RerankCandidate`, `RerankedCandidate`, Zod `rerankCandidateSchema`/`rerankedCandidateSchema`, `RerankerProvider` interface with `rerank(query, candidates[])`) + `mock-reranker-provider.ts` (`MockRerankerProvider` token-overlap scoring + hash jitter 0.01, deterministic, `createRerankerProvider` factory with `RERANKER_PROVIDER`/`RERANKER_MODEL`/`RERANKER_BASE_URL`/`RERANKER_ENDPOINT`, mock default vs local) + `local-reranker-provider.ts` (`LocalRerankerProvider` for BGE `bge-reranker-base` via `POST /rerank` generic, flexible response parsing for `results[].relevance_score`/`scores[]`/`data[]`, timeout 30s, AbortController) + `mock-reranker-provider.test.ts` 16 + `local-reranker-provider.test.ts` 15 tests + `.env.example` `RERANKER_PROVIDER/MODEL/BASE_URL/ENDPOINT` docs + `index.ts` re-exports; 507 tests passing (+31), typecheck/lint/build green; pgvector on 5434.

## What Is Working

- Everything from Phases 0–2 + P3-001..P5-001 merged through #54 (`main` at `f0a2c01` includes P3-007 date extraction + P3-006 metadata LLM).
- Full-text search (P5-005), embedding interface (P5-002), local embedding adapter (P5-003), generate/store embeddings (P5-004), vector search (P5-006), hybrid retrieval (P5-007), search API (P5-009), search UI (P5-010), search eval (P5-014), review queue (P4-001), supersession (P4-003), publication permission (P4-006), document detail API/page (P6-001/002), LLM provider (P8-001), local LLM adapter (P8-002), permission-aware retrieval (P8-004), context builder (P8-005), RAG answer service (P8-006), citation contract (P8-007), unsupported (P8-008), /ai/ask API (P8-009), Ask UI (P8-010), prompt-injection (P8-011), RAG eval (P8-012), cross-tenant RAG (P8-013), E2E critical path (P9-001), security regression (P9-002), final report (P9-008) — all per FINAL_IMPLEMENTATION_REPORT.md.
- **NEW P5-008 (branch)**:
  - **`packages/processing/src/reranker.ts`**: `RerankCandidate`/`RerankedCandidate` + `rerankCandidateSchema`/`rerankedCandidateSchema` + `RerankerProvider` interface (`modelName()`, `rerank(query, candidates) → RerankedCandidate[]` with `rerankScore` 0..1, `rerankRank`).
  - **`packages/processing/src/mock-reranker-provider.ts`**: `MockRerankerProvider` — token overlap (`queryTokens ∩ title+content`) / queryLen base + SHA256 jitter 0..0.01, sort by `rerankScore` DESC + originalIndex, deterministic, `createMockRerankerProvider`, `createRerankerProvider` reading `RERANKER_PROVIDER` (mock/test/heuristic default) vs `local|ollama|vllm|openai|http|bge` → `LocalRerankerProvider`.
  - **`packages/processing/src/local-reranker-provider.ts`**: `LocalRerankerProvider` — `DEFAULT_MODEL bge-reranker-base`, `resolveEndpoint` (generic `.../rerank` vs `.../v1/` openai), `rerank` POST `{ model, query, documents: [{text, id}] }`, `parseScores` handles `results[].relevance_score|score`, `scores[]`, `data[]` + fallback numeric array search, scores capped 0..1, sorts, timeout 30s.
  - **`packages/processing/src/mock-reranker-provider.test.ts`**: 16 tests (modelName, custom, empty query throws, empty candidates, token-overlap ranking exam top, deterministic, different query order, preserves fields, title+content, non-array throws, factory mock).
  - **`packages/processing/src/local-reranker-provider.test.ts`**: 15 tests (modelName, custom, empty query, empty candidates no fetch, fetch results shape, scores shape, data shape, HTTP error, unexpected shape, custom endpoint, trailing slash, factory, caps 0..1, factory switch mock/local).
  - **`.env.example`**: adds `RERANKER_PROVIDER=mock|local|...`, `RERANKER_MODEL`, `RERANKER_BASE_URL`, `RERANKER_ENDPOINT` docs.
  - **`packages/processing/src/index.ts`**: re-exports `reranker`, `mock-reranker-provider`, `local-reranker-provider`.
- Prior P3-007: dates (38 tests), P3-006: metadata LLM (23 tests) still passing.

## What Is Not Implemented

- Phase 3 remainder: retry/status UI (P3-009), scanned-PDF integration tests (P3-010).
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
- Git uses task branches and pull requests; merging into `main` requires the repository's approval policy.

## Current Git State

`main` at `f0a2c01` (Merge PR #54 P3-007). Task branch `feat/P5-008-reranker` adds reranker (31 tests, .env.example, index re-exports), all checks green:

```text
lint ✅  typecheck ✅  tests ✅ (507, +31)  build ✅  format ✅  migration ✅ (pgvector on 5434)
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
| Unit/integration tests | PASS (507) |
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
| Full-text search (tsvector trigger, GIN, ranking) | PASS (4) |
| E2E tests (P9-001) | PASS (10/17 flows) |
| Security regression (P9-002) | PASS (7) |
| Final gate report (P9-008) | DONE |

## Next Recommended Action

After P5-008 merges, start **P6-006** (Add related documents — P1, now unblocked by P5-008) or **P6-003** (Add document summary display — P1, unblocked by P3-006) or **P6-004** (Add important dates API/UI — P1, unblocked by P3-007) or **P4-004** (Build approval queue UI — P1).

## Last Updated

2026-08-21
