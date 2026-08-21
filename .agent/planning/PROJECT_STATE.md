# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 9 (Hardening) — P9-001 E2E + P9-002 security regression + P9-008 MVP final gate DONE; Phase 8 (Institutional AI) P0 DONE; Phase 3 P1 — P3-006 DONE (merged #53), P3-007 DONE on task branch `feat/P3-007-date-extraction`, P3-009/010 still TODO.

## Current Task

**P3-007** (Implement date extraction — P1) — implementation complete on task branch `feat/P3-007-date-extraction`; 38 unit tests (17 heuristic + 21 LLM) passing, typecheck/lint/build green, 476 tests total.

## Current Branch

`feat/P3-007-date-extraction`

## Overall Status

`PHASE_9_DONE` — all P0 tasks DONE and `docs/FINAL_IMPLEMENTATION_REPORT.md` at `main` `19eb735` (P3-006 merged); `PHASE_8_DONE` — all P0 DONE; `PHASE_3_PROGRESS` — P3-001..006/008 DONE, **P3-007 DONE on branch** (needs PR), P3-009/010 TODO; `PHASE_4/5/6` remain P1 UI/reranker TODO.

## Last Completed Task

P3-007 (Implement date extraction — P1) — `packages/processing/src/dates.ts` (`ImportantDate`, `DateExtractionResult`, Zod `importantDateSchema`/`dateExtractionResultSchema`, `DateExtractor` interface) + `heuristic-date-extractor.ts` (`HeuristicDateExtractor` regex for `18 August 2026`/`August 18, 2026`/`2026-08-18`/`18/08/2026` with ordinal, dedup, sentence context, label/type inference for deadline/exam/registration/submission/holiday/event, confidence) + `llm-date-extractor.ts` (`LlmDateExtractor` with `LLMProvider` + heuristic fallback, `SYSTEM_PROMPT` strict JSON, `extractJsonObject`, `normalizeResult` caps 20, Zod, empty bypass) + `date-factory.ts` (`createDateExtractor` unified with `DATE_PROVIDER`/`METADATA_PROVIDER`/`LLM_PROVIDER`, heuristic default) + `heuristic-date-extractor.test.ts` 17 + `llm-date-extractor.test.ts` 21 tests + `.env.example` `DATE_PROVIDER` docs + `index.ts` re-exports; 476 tests passing (+38), typecheck/lint/build green; pgvector on 5434.

## What Is Working

- Everything from Phases 0–2 + P3-001..P5-001 merged through #53 (`main` at `19eb735` includes P3-006 LLM metadata provider).
- Full-text search (P5-005), embedding interface (P5-002), local embedding adapter (P5-003), generate/store embeddings (P5-004), vector search (P5-006), hybrid retrieval (P5-007), search API (P5-009), search UI (P5-010), search eval (P5-014), review queue (P4-001), supersession (P4-003), publication permission (P4-006), document detail API/page (P6-001/002), LLM provider (P8-001), local LLM adapter (P8-002), permission-aware retrieval (P8-004), context builder (P8-005), RAG answer service (P8-006), citation contract (P8-007), unsupported (P8-008), /ai/ask API (P8-009), Ask UI (P8-010), prompt-injection (P8-011), RAG eval (P8-012), cross-tenant RAG (P8-013), E2E critical path (P9-001), security regression (P9-002), final report (P9-008) — all per FINAL_IMPLEMENTATION_REPORT.md.
- **NEW P3-007 (branch)**:
  - **`packages/processing/src/dates.ts`**: `IMPORTANT_DATE_TYPES`/`ImportantDate`/`DateExtractionInput/Result`/`importantDateSchema`/`dateExtractionResultSchema`/`DateExtractor` interface (TECHNICAL_SPEC §8, AI_LLM §12, PRD FR-004).
  - **`packages/processing/src/heuristic-date-extractor.ts`**: `HeuristicDateExtractor` — `MONTHS`/`MONTH_DAY_YEAR`/`ISO`/`DMY_SLASH` regexes, `isValidDate`/`toIso`, `extractSentence` 500-cap, `inferLabelAndType` (deadline/last date→DEADLINE etc), `findMatches` dedup, `extract` maps to `ImportantDate` with context/confidence, overall confidence via max.
  - **`packages/processing/src/llm-date-extractor.ts`**: `LlmDateExtractor` — `SYSTEM_PROMPT` strict JSON (`dates[]` with raw/isoDate/label/type/context/confidence, provider llm), `truncateText` 4000, `extractJsonObject` fences, `normalizeResult` coerces type (IMPORTANT_DATE_TYPES), ISO regex, caps 20, Zod, empty bypass without LLM, throw→heuristic fallback.
  - **`packages/processing/src/date-factory.ts`**: `createDateExtractor({provider,llmProvider})` — reads `DATE_PROVIDER`||`METADATA_PROVIDER`||`LLM_PROVIDER`||`heuristic`, `isLlm` for `llm|local|ollama|openai|vllm|http|mock`, returns `HeuristicDateExtractor` default else `LlmDateExtractor` with `createLLMProvider`.
  - **`packages/processing/src/heuristic-date-extractor.test.ts`**: 17 tests (provider name, 18 Aug 2026 deadline, August 18 2026, ISO 2026-08-18, DMY 18/08/2026, dash/dot, ordinal 18th, exam label, empty, empty text, dedup, multiple 3, context 500, invalid 31 Feb null, schema-conformant loop, schema rejects).
  - **`packages/processing/src/llm-date-extractor.test.ts`**: 21 unit + factory suite 8 → 29? actually 21 tests total covering modelName, valid JSON, empty→heuristic no call, invalid JSON→heuristic, fences, wrap, throw, empty response, no dates, caps 20, type case, truncate, createLlm, schema loop + factory: heuristic default, DATE_PROVIDER=llm/local aliases, fallback to METADATA/LLM, explicit override, llmProvider option.
  - **`.env.example`**: adds `DATE_PROVIDER=heuristic|llm|local|...` docs.
  - **`packages/processing/src/index.ts`**: re-exports `dates`, `HeuristicDateExtractor`/`createHeuristicDateExtractor`, `date-factory` (`createDateExtractor` unified), `llm-date-extractor`.
- Prior P3-006: LlmMetadataExtractor + metadata-factory (23 tests) still passing.

## What Is Not Implemented

- Phase 3 remainder: retry/status UI (P3-009), scanned-PDF integration tests (P3-010).
- Search remainder: reranker (P5-008), filters/facets (P5-011), search analytics (P5-012), unresolved (P5-013).
- Phases 4 remainder: approval queue UI (P4-004), version history UI (P4-005).
- Phases 6 remainder: summary (P6-003 now unblocked by P3-006), important dates API/UI (P6-004 now unblocked by P3-007), bookmarks (P6-005), related (P6-006 depends P5-008), share (P6-007).
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
- AI providers remain replaceable via adapters; `METADATA_PROVIDER`/`DATE_PROVIDER` mirror `EMBEDDING_PROVIDER`/`LLM_PROVIDER` (ADR-003 local-first).
- Git uses task branches and pull requests; merging into `main` requires the repository's approval policy.

## Current Git State

`main` at `19eb735` (Merge PR #53 P3-006). Task branch `feat/P3-007-date-extraction` adds date extraction (38 tests, .env.example, index re-exports), all checks green:

```text
lint ✅  typecheck ✅  tests ✅ (476, +38)  build ✅  format ✅  migration ✅ (pgvector on 5434)
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
| Unit/integration tests | PASS (476) |
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
| Full-text search (tsvector trigger, GIN, ranking) | PASS (4) |
| E2E tests (P9-001) | PASS (10/17 flows) |
| Security regression (P9-002) | PASS (7) |
| Final gate report (P9-008) | DONE |

## Next Recommended Action

After P3-007 merges, start **P6-004** (Add important dates API/UI — P1, now unblocked), **P6-003** (Add document summary display — P1, unblocked by P3-006), **P4-004** (Build approval queue UI — P1), or **P5-008** (Implement reranker — P1).

## Last Updated

2026-08-21
