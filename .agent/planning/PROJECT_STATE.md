# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 9 (Hardening) — P9-001 E2E + P9-002 security regression + P9-008 MVP final gate DONE; Phase 8 (Institutional AI) P0 DONE — LLM provider + local adapter + permission-aware retrieval + context builder + RAG answer + citation contract + unsupported + /ai/ask API + Ask UI + prompt-injection + RAG eval + cross-tenant RAG DONE; Phase 3 P1 — P3-006 DONE on task branch, P3-007/009/010 still TODO.

## Current Task

**P3-006** (Implement metadata extraction provider — P1) — implementation complete on task branch `feat/P3-006-metadata-llm-provider`; 23 unit tests passing, typecheck/lint/build green, 438 tests total.

## Current Branch

`feat/P3-006-metadata-llm-provider`

## Overall Status

`PHASE_9_DONE` — all P0 tasks DONE and `docs/FINAL_IMPLEMENTATION_REPORT.md` at `main` `16f908c`; `PHASE_8_DONE` — P8-001/002/004/005/006/007/008/009/010/011/012/013 all DONE; `PHASE_6_DONE` for detail — P6-001/002 DONE; `PHASE_4_DONE` for publishing — P4-001/002/003/006 DONE; `PHASE_5_DONE` — P5-001/002/003/004/005/006/007/009/010/014 DONE; Phase 3 — P3-001..005/008 DONE, **P3-006 DONE on branch** (needs PR merge), P3-007/009/010 still TODO.

## Last Completed Task

P3-006 (Implement metadata extraction provider — P1) — `packages/processing/src/llm-metadata-extractor.ts` (`LlmMetadataExtractor` with `LLMProvider` + heuristic fallback, `normalize`, `extractJsonObject`, `SYSTEM_PROMPT` grounded, `maxTextChars` 4000, empty-text bypass) + `packages/processing/src/metadata-factory.ts` (`createMetadataExtractor` unified factory with `METADATA_PROVIDER`/`LLM_PROVIDER` env switch, heuristic default) + `llm-metadata-extractor.test.ts` 23 unit tests (valid JSON, fences, wrap, invalid/fallback, empty, truncate, tags/caps, course/semester, language, factory switch) + `.env.example` `METADATA_PROVIDER` docs + `packages/processing/src/index.ts` re-exports; 438 tests passing (+23), typecheck/lint/build green; pgvector on 5434 for verification.

## What Is Working

- Everything from Phases 0–2 + P3-001..P5-001 (merged into `main` via PRs #1–#24) plus all later merges through #52 (`main` at `16f908c` includes P9-001/002/008).
- Full-text search (P5-005), embedding interface (P5-002), local embedding adapter (P5-003), generate/store embeddings (P5-004), vector search (P5-006), hybrid retrieval (P5-007), search API (P5-009), search UI (P5-010), search eval (P5-014), review queue (P4-001), supersession (P4-003), publication permission (P4-006), document detail API/page (P6-001/002), LLM provider (P8-001), local LLM adapter (P8-002), permission-aware retrieval (P8-004), context builder (P8-005), RAG answer service (P8-006), citation contract (P8-007), unsupported (P8-008), /ai/ask API (P8-009), Ask UI (P8-010), prompt-injection (P8-011), RAG eval (P8-012), cross-tenant RAG (P8-013), E2E critical path (P9-001), security regression (P9-002), final report (P9-008) — all per FINAL_IMPLEMENTATION_REPORT.md.
- **NEW P3-006 (branch)**:
  - **`packages/processing/src/llm-metadata-extractor.ts`**: `LlmMetadataExtractor implements MetadataExtractor` — `name() → llm:model`, `extract({text,filename,mimeType})` builds truncated (4000) prompt with `SYSTEM_PROMPT` (strict JSON, 200-char title, 500-char summary, 3-10 tags, academicYear/course/semester/language/confidence), calls `LLMProvider.generate` (temperature 0, maxTokens 800, Abort via provider), `extractJsonObject` handles fences/wrapping (` ```json` + first `{` last `}`), `normalizeResult` coerces documentType/tags/semester/academicYear/course/language/confidence, Zod validates, language fallback via heuristic if null, empty-text bypass without LLM, any throw → heuristic fallback (`HeuristicMetadataExtractor`).
  - **`packages/processing/src/metadata-factory.ts`**: `createMetadataExtractor({provider, llmProvider})` — reads `METADATA_PROVIDER` || `LLM_PROVIDER` || `heuristic`, lowercases, `isLlm` for `llm|local|ollama|openai|vllm|http|mock`, returns `HeuristicMetadataExtractor` default else `LlmMetadataExtractor` with `createLLMProvider` (`mock` default, `local` → Ollama `qwen2:7b`).
  - **`packages/processing/src/llm-metadata-extractor.test.ts`**: 23 unit tests (modelName, valid JSON, empty→heuristic no call, invalid JSON→heuristic, malformed, fences, wrapping, throw, empty response, tags cap/lower, course upper/semester range, documentType case/invalid, truncate marker, Hindi, factory, schema-conformant loop, plus factory suite: heuristic default, llm/local aliases, explicit provider override, llmProvider option).
  - **`packages/processing/src/index.ts`**: re-exports `{HeuristicMetadataExtractor, createHeuristicMetadataExtractor}`, `* from './llm-metadata-extractor.js'`, `* from './metadata-factory.js'`.
  - **`.env.example`**: documents `LLM_PROVIDER/LLM_BASE_URL/LLM_MODEL/LLM_ENDPOINT` (expanded) and `METADATA_PROVIDER=heuristic|llm|local|ollama|openai|vllm|http|mock` with note that `llm` uses `LLM_*`.
  - Prior heuristic baseline intact (`HeuristicMetadataExtractor` 20 tests) — now superseded by LLM provider when `METADATA_PROVIDER=llm`.

## What Is Not Implemented

- Phase 3 remainder: date extraction (P3-007), retry/status UI (P3-009), scanned-PDF integration tests (P3-010).
- Search remainder: reranker (P5-008), filters/facets (P5-011), search analytics (P5-012), unresolved (P5-013).
- Phases 4 remainder: approval queue UI (P4-004), version history UI (P4-005).
- Phases 6 remainder: summary (P6-003 depends P3-006), important dates (P6-004 depends P3-007), bookmarks (P6-005), related (P6-006 depends P5-008), share (P6-007).
- Phase 7 notifications (P7-001→006).
- P8-003 cloud LLM adapter (P1), P9-003/004/005/006/007 (P1 load/metrics/backup/deploy).
- PDF page rasterization for scanned-PDF OCR (backlogged).

## Active Blockers

- PR requires human approval to merge into `main` (repository merge policy).
- Host Postgres (18.6 on 5432) lacks `pgvector` — use docker `pgvector/pgvector:pg17` on 5434 (`DATABASE_URL=postgresql://postgres:postgres@localhost:5434/institutional_knowledge`) and `REDIS_URL=redis://localhost:6379` for verification; CI uses pgvector service and is green. Host `docker compose` postgres fails to bind 5432 when host postgres running — use separate `ikp-pgvector-test-5434` container.

## Important Decisions

- **Working product title:** Institutional Knowledge Platform.
- Final commercial branding is intentionally deferred until MVP validation.
- Technical identifiers remain product-name agnostic (`@ikp/*` package scope).
- Stack: pnpm workspace; Fastify (API); Next.js (web); Vitest; ESLint flat config; Prettier; node-pg-migrate; PostgreSQL/pgvector (pgvector/pg17, `vector(1024)` for BGE-M3 1024 dims); Redis; MinIO (S3-compatible).
- API and worker use distinct port variables (`API_PORT`, `WORKER_PORT`) because they share the repo `.env`.
- Migrations are CommonJS `.js` files under `infra/migrations/`; ESLint flat config declares CJS globals for that directory.
- AI providers remain replaceable through adapters/interfaces; `METADATA_PROVIDER` env mirrors `EMBEDDING_PROVIDER`/`LLM_PROVIDER` pattern.
- Git uses task branches and pull requests; merging into `main` requires the repository's approval policy.

## Current Git State

`main` at `16f908c` (Merge PR #52 P9-008 MVP final gate). Task branch `feat/P3-006-metadata-llm-provider` adds LLM metadata extractor (23 tests, .env.example, index re-exports), all checks green:

```text
lint ✅  typecheck ✅  tests ✅ (438, +23)  build ✅  format ✅  migration ✅ (pgvector on 5434)
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
| Unit/integration tests | PASS (438) |
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
| Full-text search (tsvector trigger, GIN, ranking) | PASS (4) |
| E2E tests (P9-001) | PASS (10/17 flows) |
| Security regression (P9-002) | PASS (7) |
| Final gate report (P9-008) | DONE |

## Next Recommended Action

After P3-006 merges, start **P3-007** (Implement date extraction — P1, depends P3-006) or **P6-003** (Add document summary display — P1, now unblocked by P3-006) or **P4-004** (Build approval queue UI — P1) or **P5-008** (Implement reranker — P1). Phase 3 date extraction unlocks `P6-004` important dates and `P7-006` deadline reminders.

## Last Updated

2026-08-21
