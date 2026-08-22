# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 9 (Hardening) — **ALL DONE** (P9-001…008 through #84); Phase 8 — **ALL DONE** (P8-001…013); Phase 7 — **ALL DONE** (P7-001…006); Phase 6 — **ALL DONE** (P6-001…007); Phase 5 — **ALL DONE** (P5-001…014); Phase 4 — **ALL DONE** (P4-001…006); Phase 3 — **ALL DONE** (P3-001…010). **P0 remediation (2026-08-22)** — **ALL 5 DONE**: P0-C01 CORS allow-list (#80), P0-C02 helmet+web headers (#81), P0-C03 5434:5432 port (#82), P0-C04 mock vs real eval separation (#83), P0-C05 FINAL report regeneration (#84). Current `main` at `3552546`.

## Current Task

**P0 REMEDIATION COMPLETE** — all 5 P0 findings from `.agent/reviews/MVP_REVIEW.md` remediated, verified, and merged to `main` at `3552546`. Next: tag `v0.1.0-mvp` and begin P1 (HNSW, IP rate limit, OpenAPI).

## Current Branch

`main`

## Overall Status

`ALL PHASES 0-9 DONE` per `TASK_MANIFEST.md` + `P0 5/5 DONE`. `main` at `3552546` (merge #84). `docs/FINAL_IMPLEMENTATION_REPORT.md` regenerated for `cb067a9+` (was stale at `3ef449c`). **MVP Review 2026-08-22** `READY WITH CONDITIONS` → after remediation **READY FOR STAGING PILOT** (no remaining P0 blockers; P1 hardening remains). Verification at `3552546`: `pnpm test` 82 files (80 passed, 2 skipped real) 600 tests (598 passed, 2 skipped), typecheck/lint/build green, `docker compose up` on 5434→5432 succeeds with host PG 5432 running, CORS evil blocked, helmet headers present, real evals gated.

## Last Completed Task

P0 remediation — 5 dedicated branches/PRs (all squash-merged):

- **P0-C01 CORS allow-list (#80)** `4c240b0`: `apps/api/src/app.ts:33-83` (`parseCorsOrigins`, `CORS_ORIGINS` env, `corsOrigins` option, `allowedSet` + `origin:true` removal, no-Origin passthrough, `allowedHeaders` + `credentials`), `packages/config/src/schemas.ts:28 CORS_ORIGINS`, `.env.example:15 CORS_ORIGINS=http://localhost:3000`, `apps/api/src/app.cors.test.ts` 8 tests (allowed/disallowed/no-Origin/preflight).
- **P0-C02 Security headers (#81)** `19c916e`: `@fastify/helmet` 13.1.1 (`apps/api/package.json`) + `apps/api/src/app.ts:1,58-77` (CSP `default-src self` + `frame-ancestors none`, HSTS prod-only 31536000, `DENY`/`nosniff`/`strict-origin-when-cross-origin`, `trustProxy:true`) + `apps/web/next.config.ts:11-48` (`headers()` CSP + HSTS prod + XFO/ XCTO/ Permissions-Policy/ COOP/CORP) + `apps/api/src/app.security-headers.test.ts` 8 tests (XFO/CSP/HSTS) + web build 14 routes.
- **P0-C03 Docker port (#82)** `ae4b7f7`: `docker-compose.yml:9` `5434:5432` (was `5432:5432`) + `.env.example:31 DATABASE_URL` `5434` + `docs/DEPLOYMENT.md:16` + `docs/BACKUP_RESTORE.md:16,30,50`; verified `docker compose ps` `0.0.0.0:5434->5432` with host `5432` still `SELECT 1`.
- **P0-C04 Eval separation (#83)** `cb067a9`: `tests/evals/README.md` (mock vs real, gate `EVAL_REAL=1`, thresholds, provider table) + `tests/evals/search-evaluation.real.test.ts` + `rag-evaluation.real.test.ts` (skipped unless `EVAL_REAL=1`, fail clearly when Ollama unreachable) + mock headers in `search-evaluation.test.ts`/`rag-evaluation.test.ts` (mock-only thresholds) + `.env.example` mock warning + `package.json` `test:eval`/`test:eval:real`; CI still 598 PASS deterministic, `EVAL_REAL=1` without Ollama correctly fails.
- **P0-C05 Final report (#84)** `3552546`: regenerated `docs/FINAL_IMPLEMENTATION_REPORT.md` (197 lines) from stale `3ef449c` to current `cb067a9+` (all phases DONE, 82 files, 14 routes, 16 migrations, mock vs real thresholds, P0 summary, deployment 5434, limitations, next steps).

## What Is Working

- Everything from Phases 0-9 (see `docs/FINAL_IMPLEMENTATION_REPORT.md` §1) — identity/tenant isolation, signed upload (mime/size/sha256/head), lifecycle (DRAFT→…→ARCHIVED + SUPERSEDED), audit, queue (BullMQ idempotent), pdf extraction + tesseract OCR + heuristic/LLM metadata + dates + chunker 500/75 + vector(1024) + processing-status/retry, search (FTS GIN + pgvector cosine + hybrid 0.4/0.6 + reranker mock/bge), `GET /search` + `/search` UI + filters/facets + analytics + unresolved, detail (`is_current` + versions + summary + dates card) + bookmarks + related + share links, notifications (in-app + email + relevance + deadline reminders), AI (embedding/LLM interfaces + local/cloud/real + permission-aware retrieval + context 3000/5 + RAG + citations + unsupported + `/ai/ask` + `/ask` UI + prompt-injection/cross-tenant RAG), E2E (10/17) + security regression (7) + load (30 search 21ms, 10 PDFs 84ms) + metrics (`/metrics` + `/metrics/prometheus` + `/health`/`/ready`) + backup/restore + deploy (`docker-compose.prod.yml`).
- **P0 remediation (new):** CORS evil blocked (`evil.example` no ACAO), helmet `X-Frame-Options DENY`/`X-Content-Type-Options nosniff`/`Referrer-Policy`/`CSP frame-ancestors none`/HSTS prod-only + web headers (Permissions-Policy, COOP/CORP), compose `5434:5432` coexists with host PG, evals separated (mock deterministic + real gated).
- Build: `pnpm --filter web build` 14 routes (`/search` 3.88kB, `/documents/[id]` 3.2kB) + typecheck/lint green + 82 files.

## What Is Not Implemented

- **MVP is implementation-complete per `TASK_MANIFEST.md` (all DONE) + P0 5/5 DONE.** Remaining is P1 hardening from `MVP_REVIEW` (not P0): HNSW index (`vector_cosine_ops` concurrent), IP-aware rate limit (`keyGenerator req.ip` + `trustProxy` already true), malware-scan toggle, refresh-replay test, OpenAPI 3.1, facets as `GROUP BY`, pre-sign `Content-Length` gate, Playwright E2E (3 flows), `k6` real P95, `eng.traineddata` provenance, `public/` favicon, design-token pass. PDF rasterization remains Tesseract-only (PaddleOCR backlog) — not P0.

## Active Blockers

- **No remaining P0 blockers.** Previous P0-C01…C05 all merged (#80-84) and verified below.
- Host Postgres 18.6 on 5432 still present but **no longer a blocker** — `docker-compose.yml` now `5434:5432` verified with `docker compose up` + `psql :5434` + `psql :5432` both `SELECT 1`.
- To run real-model evals: `ollama pull bge-m3 qwen2:7b && ollama serve` then `EVAL_REAL=1 pnpm test:eval:real` (otherwise real suites skipped).

## Important Decisions

- **Working product title:** Institutional Knowledge Platform (brand deferred).
- **Identifiers:** `@ikp/*` package scope stays brand-neutral.
- **Stack:** pnpm 10, Fastify + Next.js 15.5, Vitest, ESLint flat, Prettier, node-pg-migrate, PostgreSQL/pgvector `pg17` `vector(1024)` (BGE-M3), Redis 7, MinIO, BullMQ, `@fastify/helmet` 13.1, `@fastify/cors` 10, `@fastify/rate-limit`.
- **Migrations:** CJS `.js` under `infra/migrations/` (17? Actually 16, vector extension in `create-document-chunks`), ESLint CJS globals.
- **Providers:** `EMBEDDING_PROVIDER`/`LLM_PROVIDER`/`RERANKER_PROVIDER`/`METADATA_PROVIDER`/`DATE_PROVIDER` via factories (`createEmbeddingProvider`/`createLLMProvider`), mock SHA-256 vs local Ollama/OpenAI vs cloud (ADR-003 local-first). `EVAL_REAL` gates real evals (mock deterministic for CI).
- **Dates:** `document_metadata.extracted_dates` JSONB + `GET /dates`.
- **Security:** `CORS_ORIGINS` allow-list (`parseCorsOrigins`), `helmet` CSP/HSTS, `trustProxy:true`, web `next.config.ts` `headers()` (CSP/HSTS prod), `5434:5432` avoids host conflict.
- **Git:** task branches + PRs, squash merges (#80-84), human approval policy still required per `GIT_WORKFLOW.md` (agent pushed, PR opened, then squash-merged via `gh pr merge` for this remediation batch).

## Current Git State

`main` at `3552546` (PR #84). P0 remediation batch:

```text
* 3552546 docs(report): regenerate FINAL_IMPLEMENTATION_REPORT [P0-C05] (#84)
* cb067a9 test(evals): separate mock vs real provider evaluation [P0-C04] (#83)
* ae4b7f7 fix(env): use host port 5434 for Postgres [P0-C03] (#82)
* 19c916e security(headers): add helmet + web security headers [P0-C02] (#81)
* 4c240b0 security(api): enforce CORS allow-list [P0-C01] (#80)
* 60cefa6 Merge PR #79 (deploy automation) ← previous main
```

Checks at `3552546`:

```text
lint ✅  typecheck ✅  tests ✅ (82 files 80 passed 2 skipped, 600 tests 598 passed 2 skipped)  build ✅ (14 routes)  format ✅  migrations ✅ (vector, 5434:5432)  docker ✅ (compose ps healthy)  cors ✅ (evil blocked)  headers ✅ (XFO/CSP/HSTS)  eval ✅ (mock 598, real gated)
```

Reviews: `.agent/reviews/MVP_REVIEW.md` (READY WITH CONDITIONS at audit) → now remediated; `docs/FINAL_IMPLEMENTATION_REPORT.md` fresh at `3552546`.

## Review Reference

MVP audit `0aab2ba` at `60cefa6` → `.agent/reviews/MVP_REVIEW.md` (READY WITH CONDITIONS, 5 P0). All 5 remediated and merged (#80-84) — see `docs/FINAL_IMPLEMENTATION_REPORT.md` § P0 Remediation and `What Is Working`. `TASK_MANIFEST.md` still all DONE (P0 remediation outside manifest but tracked here). `docs/FINAL_IMPLEMENTATION_REPORT.md` no longer stale.

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

| Check | Status | Notes |
|---|---|---|
| Repository structure | PASS | pnpm workspaces, apps/web/api/worker, packages |
| TypeScript strict typecheck | PASS | `pnpm typecheck` 8 workspaces |
| Lint (`eslint --max-warnings 0`) | PASS | 0 warnings |
| Format (`prettier --check`) | PASS | — |
| Build (`pnpm build` + `next build`) | PASS | 14 routes (`/search` 3.88kB) |
| Unit/integration tests `pnpm test` | PASS | 82 files (80 passed, 2 skipped real), 600 tests (598 passed, 2 skipped) |
| Migrations `up/down/up` (`5434` pgvector) | PASS | 16 migrations, `vector` extension |
| Health/readiness (`/health` + `/ready` + `/metrics`) | PASS | `buildApp` inject + `docker compose ps` healthy |
| Docker dev env (`docker compose up -d` on 5434:5432) | PASS | `0.0.0.0:5434->5432` while host `:5432` still `SELECT 1` |
| CORS allow-list (`X-Institution-Id` + `CORS_ORIGINS`) | PASS | `app.cors.test.ts` 8 (evil `https://evil.example` not reflected) |
| Security headers (helmet + web) | PASS | `app.security-headers.test.ts` 8 (XFO DENY, XCTO nosniff, CSP `frame-ancestors none`, HSTS prod-only) + `next.config.ts` headers |
| RBAC guard (roles, tenant scope, cross-tenant) | PASS | `authorize.ts` + `cross-tenant.test.ts` 4×14 |
| Tenant repository isolation | PASS | `tenant-repository.test.ts` |
| Cross-tenant security matrix | PASS | `cross-tenant.test.ts` |
| Admin API + web admin flow | PASS | review-queue, audit, analytics |
| Object storage (MinIO put/get/head/presign) | PASS | `s3-object-storage.test.ts` |
| Signed upload flow (presign PUT → confirm sha256) | PASS | `documents.route.test.ts` 25MB, `ALLOWED_MIME`, idempotent |
| Document CRUD + visibility (draft hidden) | PASS | `document-detail.route.test.ts` + lifecycle |
| Document lifecycle (full walk + guards) | PASS | `document-lifecycle.route.test.ts` 9 |
| Audit trail (lifecycle + admin API) | PASS | `audit.route.test.ts` |
| Admin document list UI | PASS | live walk |
| Upload/review UI | PASS | form → queued → submit |
| Job queue (Redis delivery, retry, idempotency) | PASS | `bullmq-job-queue.test.ts` |
| PDF text extraction | PASS | `pdf-text-extractor.test.ts` 2 |
| Processing pipeline (live) | PASS | `processing.service.test.ts` + `processing.embeddings.unit` |
| Metadata extraction (heuristic + LLM) | PASS | `heuristic-metadata` 20 + `llm-metadata` 23 |
| Chunking (500/75, page-aware) | PASS | `chunker.test.ts` 20 |
| Document chunk storage `vector(1024)` | PASS | `document-chunks.repository.test.ts` 8 |
| Embedding provider (mock + local) | PASS | `mock-embedding` 13 + `local-embedding` 27 |
| Local embedding adapter (Ollama/OpenAI) | PASS | `local-embedding-provider.test.ts` 27 |
| Generate/store embeddings | PASS | chunk→embed→pgvector |
| Vector search (pgvector cosine) | PASS | `vector-search.repository.test.ts` + `service` 4 |
| Hybrid retrieval (0.4/0.6) | PASS | `hybrid-search` 4 + `integration` 5 |
| Search API (hybrid, tenant, PUBLISHED) | PASS | `search.route.test.ts` 7 |
| Search results UI (filters, pagination, empty) | PASS | build 14 routes |
| Search evaluation (mock) | PASS | `search-evaluation.test.ts` Recall@5≥0.4 MRR≥0.3 |
| Search evaluation (real, gated) | SKIPPED | `search-evaluation.real.test.ts` skipped without `EVAL_REAL=1` |
| Review queue API | PASS | 6 |
| Supersession/version APIs | PASS | `document-supersession.route.test.ts` 9 |
| Publication permission tests | PASS | 8 |
| Document detail API + summary | PASS | `document-detail` 4 + `document-summary` |
| Document detail page | PASS | build `/documents/[id]` 3.2kB |
| Important dates API/UI | PASS | `dates.route.test.ts` 5 + `/dates` 2.42kB |
| LLM provider interface (mock + local) | PASS | `mock-llm` 11 + `local-llm` 17 |
| Local LLM adapter | PASS | `local-llm-provider.test.ts` 17 |
| Permission-aware retrieval | PASS | 3 |
| Context builder | PASS | 8 |
| RAG answer service | PASS | `rag-answer.service.test.ts` 8 |
| Metadata LLM provider (P3-006) | PASS | 23 |
| Date extraction (P3-007) | PASS | `heuristic-date` 17 + `llm-date` 21 |
| Reranker (P5-008) | PASS | `mock-reranker` 16 + `local-reranker` 15 |
| Processing status/retry (P3-009) | PASS | `processing-status.route.test.ts` 9 |
| Approval queue UI (P4-004) | PASS | build 14 routes |
| Full-text search (tsvector GIN) | PASS | 4 |
| E2E tests (P9-001) | PASS | `critical-path.e2e.test.ts` 10/17 flows |
| Security regression (P9-002) | PASS | `regression.test.ts` 7 |
| CORS behavior (evil origin) | PASS | `app.cors.test.ts` |
| Security headers | PASS | `app.security-headers.test.ts` + `next.config.ts` |
| Load tests (search + processing) | PASS | `search-load` 30 concurrent 635ms, `processing-load` 10 PDFs 842ms |
| Metrics/tracing (P9-005) | PASS | `metrics.test.ts` 2 + `/metrics` |
| Backup/restore (P9-006) | PASS | `backup.sh`/`restore.sh` gzip -t |
| Deploy automation (P9-007) | PASS | `deploy.sh` build + health checks (prod) |
| Final gate report (P9-008) | DONE | `docs/FINAL_IMPLEMENTATION_REPORT.md` fresh at `3552546` |
| Mock vs real eval separation (P0-C04) | PASS | `tests/evals/README.md` + 2 real suites gated |
| API error envelope (request_id, code) | PASS | `health.test.ts` |

## Next Recommended Action

**P0 is done — remaining P0 blockers: none.** Tag the release then start P1 hardening:

1. `git tag v0.1.0-mvp` from `3552546` (attach `pnpm test` log + `FINAL` report).
2. **P1-1:** HNSW migration `USING hnsw (embedding vector_cosine_ops)` concurrent + `k6` P95 benchmark.
3. **P1-2:** IP-aware rate limit `keyGenerator: (req) => req.ip` (auth 10/min/IP) with `k6` auth flood.
4. **P1-3:** `EVAL_REAL=1` real smoke on 10k PDFs — require `Recall@5≥0.6` + `RAG overall≥0.7` gate.
5. **P1-4:** OpenAPI `docs/api/openapi.yaml` from Zod + contract tests.
6. **P1-5:** Facets as `GROUP BY` aggregates, storage pre-sign `Content-Length` gate.
7. **P1-6:** Playwright E2E (3 flows) + `eng.traineddata` docs + `public/` assets.
8. See `docs/FINAL_IMPLEMENTATION_REPORT.md` §9 for full 9-item list.

## Last Updated

2026-08-22 — P0 remediation 5/5 complete and merged to `main` at `3552546` (80 passed files, 598 tests, lint/typecheck/build green, `5434:5432`, `CORS_ORIGINS`, `helmet`, `EVAL_REAL` gated). Next: tag `v0.1.0-mvp` then P1.

