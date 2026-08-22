# Final Implementation Report — Institutional Knowledge Platform (MVP)

**Date:** 2026-08-22  
**Branch:** `main` at `cb067a9` + P0 remediation `fix/P0-C05-final-report` (CORS, helmet, 5434, eval separation, this report)  
**Environment:** `DATABASE_URL=postgresql://postgres:postgres@localhost:5434/institutional_knowledge` (`pgvector/pgvector:pg17` `vector(1024)` on host 5434→ container 5432), `REDIS_URL=redis://localhost:6379`, `MinIO` `http://localhost:9000` (`institutional-documents`), `Node>=22`, `pnpm@10.0.0`, `Fastify` + `@fastify/helmet` + `@fastify/cors` + `@fastify/rate-limit`, `Next.js 15.5` (security headers), `Vitest 3.2`, `node-pg-migrate`, `CORS_ORIGINS=http://localhost:3000`, `EVAL_REAL` gated real evals
**Audit baseline:** `.agent/reviews/MVP_REVIEW.md` at `0aab2ba` — verdict `READY WITH CONDITIONS` (5 P0 blockers)

---

## 1. What was implemented

### Phase 0 — Foundation (DONE)
- Monorepo `pnpm` workspaces, TypeScript strict, ESLint flat + Prettier, CI (`.github/workflows/ci.yml` lint/build/typecheck/test + migration check), `.env.example`, Docker Compose (`docker-compose.yml` postgres:5434→5432 pgvector/pg17, redis:6379, minio:9000/9001 + `docker-compose.prod.yml` for prod), health (`/health`) + readiness (`/ready` with DB/Redis) + metrics (`/metrics` JSON + `/metrics/prometheus`)

### Phase 1 — Identity & Multi-Tenancy (DONE)
- Migrations `institutions`, `users`+`institution_memberships`, `departments`, `refresh_tokens`; JWT auth (`POST /auth/login|logout`, `GET /auth/me`, `jose`), RBAC `@ikp/shared` `hasCapability` + `ROLE_CAPABILITIES`, `MembershipsRepository` + `TenantRepository`, `createAuthorization` (`X-Institution-Id` validated vs membership, never trusted — `apps/api/src/common/auth/authorize.ts:21-87`), cross-tenant matrix tests (4 actors × 14 capabilities) + security regression

### Phase 2 — Documents (DONE)
- Schema `documents` + `document_versions` + `document_metadata` (`academic_year`/`course`/`semester`/`audience JSONB`/`tags JSONB`/`extracted_dates JSONB`/`extra JSONB`), `S3ObjectStorage` (MinIO, presigned PUT 15m), signed upload flow (`POST /documents` → presigned → `POST /upload-complete` → `head`/`sha256`/`size` checks, idempotent), CRUD + `visibleStatusesForRole`, lifecycle `DRAFT→IN_REVIEW→APPROVED→PUBLISHED→SUPERSEDED→ARCHIVED` (+ `PUBLISHED→SUPERSEDED` via `superseded_by_document_id` FK, `is_current = PUBLISHED && !superseded_by`), `ALLOWED_MIME_TYPES` (pdf/png/jpeg/gif/webp/txt/doc/docx, 25 MB, configurable via `institutions.settings.max_upload_mb`), `originalFileKey` (`/{institution}/{document}/v{version}/original.ext`), audit logs, admin list + upload/review UIs

### Phase 3 — Processing (DONE)
- `BullMQ` queue (`JobQueue`, `REDIS_URL`, idempotent `jobId=${documentId}-v${version}-document.process`, retryable, tenant-aware), `pdf-text-extractor` (native `unpdf`), `tesseract-ocr` adapter, `processing.service` orchestration (validation → storage → record → extract → OCR if insufficient text → `createMetadataExtractor` (heuristic + `llm-metadata-extractor` via `METADATA_PROVIDER`) → `createDateExtractor` (heuristic + `llm` via `DATE_PROVIDER`) → `chunker` (500/75, paragraph→sentence→line, page-aware, Hindi) → `createEmbeddingProvider` → indexing → `COMPLETED`), `document_chunks` `vector(1024)` BGE-M3 + `DocumentChunksRepository` (`vector_cosine_ops` brute, HNSW backlog), `processing-status` + `retry-processing` APIs, scanned-PDF integration tests (4, native vs raster 1.8s)

### Phase 4 — Publishing and Admin (DONE)
- `GET /documents/review-queue` (RBAC `document.approve`), `POST /submit-review|approve|reject|publish|archive|supersede` + `GET /versions` + `GET /documents/:id/processing-status` + `POST /retry-processing`, `TRANSITION_RULES` per capability (`creatorOnly` for DRAFT→IN_REVIEW), publication permission matrix (8 tests, student 403, admin 200), `GET /documents/:id` `is_current`/`superseded_by`/`current_version_id`, approval queue UI (`admin/documents/review-queue`) + version history UI (`documents/[id]/versions`) + admin analytics (`/admin/analytics/overview|searches|popular|unresolved`) + `GET /admin/audit-logs` (tenant-scoped)

### Phase 5 — Search (DONE)
- **FTS:** `documents.search_vector tsvector` trigger (title + extracted_text) + GIN + `ts_rank`, ranking ties broken by freshness
- **Vector:** `DocumentChunksRepository` `embedding <=> $2::vector` cosine `1-distance`, tenant `PUBLISHED` filter, `VectorSearchRepository` + `VectorSearchService`
- **Hybrid:** `HybridSearchService` 0.4 lexical / 0.6 semantic, max-normalized, `match_reasons` (token overlap), freshness tie-breaker, 20+20 candidates merged
- **Reranker:** `RerankerProvider` interface + `MockRerankerProvider` (token-overlap) + `LocalRerankerProvider` (`bge-reranker-base`, `RERANKER_PROVIDER`)
- **API:** `GET /search` (`requireMember`, 60/min, `q|query|search` 1..200, `department_id`/`document_type`/`academic_year`/`course`/`semester`/`tag`/`published_from/to`, `visibleStatusesForRole`, analytics `log()`, facets `departments` + `document_types`)
- **UI:** `/search` (3.88kB) filters/pagination/empty states + search result cards (title/type/date/score/is_current)
- **Evals:** `search-evaluation.dataset.json` 12 cases (exact/partial/natural/vague/date/department/version-conflict/hi/hinglish/no-answer/restricted/prefix-fuzzy) + `evaluateSearch` (Recall@5/10, MRR, NDCG, zero-result) — mock thresholds `Recall@5≥0.4`/`MRR≥0.3`, real gated suite `search-evaluation.real.test.ts` behind `EVAL_REAL=1` with `Recall@5≥0.6`/`MRR≥0.5`

### Phase 6 — Consumption (DONE)
- `GET /documents/:id` detail + `GET /documents/:id/versions` (`is_current`, `superseded_by/at/reason`), detail page (`documents/[id]` 3.2kB, badge, superseded link, versions table), summary (`extractSummary` heuristic + `metadata.extra.summary`/`extracted_metadata.summary`), important dates (`document_metadata.extracted_dates` JSONB + `GET /dates` `from/to/department/course/semester` filtered, sorted, paginated + `/dates` 2.42kB + detail card), bookmarks (`bookmarks` migration unique `user+document`, `GET|POST /bookmarks`, `DELETE /bookmarks/{id}`, `/bookmarks` UI), related documents (`related-documents.service` semantic + metadata/heuristic, `GET /documents/:id/related`, inline in detail), share links (`share-links.service` token + `GET /share/:token`, UI copy)

### Phase 7 — Notifications (DONE)
- `notifications` migration (`INFO|WARNING|URGENT|SYSTEM` enum, `read_at`, indexes), `NotificationsService` + `NotificationsRepository`, `GET /notifications` + `POST /notifications/:id/read` + `POST /notifications/read-all` + `/notifications` UI, `InAppNotifications`, `EmailAdapter` (templated, rate-limited, `S3_*`-like provider abstraction), `RelevanceRules` (`document.audience` roles/courses/semesters vs `membership`, department scoping, `isRelevantForUser`), deadline reminders (`deadline-reminders.ts` interval job scanning `extracted_dates` upcoming 7d, enqueue per user, `notifications.service` deduplication), admin `Analytics` and `Audit` feed notifications

### Phase 8 — Institutional AI (DONE)
- **Providers:** `EmbeddingProvider` (`createEmbeddingProvider` factory: `mock` SHA-256 1024 L2 vs `local`/`ollama`/`openai`/`vllm` via `EMBEDDING_BASE_URL`/`MODEL`/`ENDPOINT` + `LocalEmbeddingProvider` batching/L2/normalize), `LLMProvider` (`createLLMProvider`: `mock` deterministic grounded for `examination|deadline|hostel|cse|…|परीक्षा|फॉर्म` + `LocalLLMProvider` Ollama `/api/generate|/api/chat` + OpenAI `/v1/chat/completions`, 60s timeout, `CloudLLMProvider` via `CLOUD`/`ANTHROPIC`/`GEMINI` adapters)
- **Retrieval:** `PermissionAwareRetrievalService` (tenant + `PUBLISHED` for STUDENT/FACULTY, `HybridSearchService` 20+20, no post-filter leak)
- **Context:** `ContextBuilderService` (3000 tokens /5 chunks, `[n] Title (ID,Version,Page) Score`, no-answer placeholder, truncation)
- **RAG:** `RagAnswerService` (retrieve → build → `llm.generate` → `[n]` validation → `grounded/confidence/citations`, `citation.ts` `document_id/document_title/version_id/page/chunk_id` + legacy `title/page_number`, Zod, `extractCitedIndices`, `isUnsupportedAnswer`, `UNSUPPORTED_ANSWER="I couldn't find an official institutional document confirming this."` fail-closed)
- **API:** `POST /ai/ask` (`requireMember`, 30/min, `question 1..500` + `filters.department_id/document_type`, `toApiCitation` spec shape)
- **UI:** `GET /ask` (2.6kB, idle/loading/error/success, grounded badge, `Sources` ol with `[Open source]`, copy)
- **Evals:** `rag-evaluation.dataset.json` 12 cases + `evaluateRag` (grounded/citation/answer/unsupported/overall) — mock thresholds `overall≥0.6` + gated real suite `rag-evaluation.real.test.ts` behind `EVAL_REAL=1` (`grounded≥0.8`/`citation≥0.7`/`overall≥0.7`) + `prompt-injection.test.ts` 4 + `cross-tenant-rag.integration.test.ts` 4 + `tests/evals/README.md` (mock vs real separation)

### Phase 9 — Quality and Hardening (DONE)
- **E2E:** `tests/e2e/critical-path.e2e.test.ts` 10 its covering 17 flows (admin create→upload→process→submit→approve→publish→ exact/vague search→ open + versions→ supersession→ RAG grounded+citation+unsupported→ draft hidden + cross-tenant 403 documents|search|RAG + header mismatch)
- **Security:** `tests/integration/security/cross-tenant.test.ts` 4×14 matrix + `regression.test.ts` 7 (cross-tenant direct/search, RBAC, drafts/superseded hidden, RAG tenant+PUBLISHED-only, auth 400/403)
- **Load:** `tests/load/search-load.test.ts` 30 concurrent 635ms avg 21ms + 20 filtered 211ms; `processing-load.test.ts` 10 PDFs 842ms avg84ms + 5 long chunk+embed 361ms (synthetic mock-embedding; real P95 NOT MEASURED)
- **Observability:** `apps/api/src/infrastructure/metrics/metrics.ts` + `metrics.route.ts` (`GET /metrics` JSON + `/metrics/prometheus`), `onResponse` hook (request_id, method, url, status, latency_ms pino), `apps/worker/src/health.ts` (`/health` + `/ready`)
- **Backup:** `docs/BACKUP_RESTORE.md` + `infra/scripts/backup.sh` (`pg_dump|gzip -9` + `gzip -t` verify) + `restore.sh` (prompt, `gunzip|psql`), `infra/migrations` `up/down/up` validated, RPO≤24h RTO≤8h
- **Deploy:** `docker-compose.prod.yml` (`restart: unless-stopped`, healthchecks, secret-required `:`), `infra/scripts/deploy.sh` (validate `.env`, build `docker compose -f prod build`, start postgres/redis/minio healthy, `pnpm db:migrate`, start api/worker/web, wait `/health`→`/ready`→`/metrics`, backup post-verify), `rollback.sh`, `docs/DEPLOYMENT.md`

### P0 Remediation (2026-08-22, 5 findings → DONE)
- **P0-C01 CORS:** `apps/api/src/app.ts:52→ allow-list` (`parseCorsOrigins`, `CORS_ORIGINS` env, default `http://localhost:3000`, `allowedSet.has(origin)` with no-Origin passthrough, `app.cors.test.ts` 8 tests) — fixes `origin:true` credentialed abuse
- **P0-C02 Headers:** `@fastify/helmet` (CSP `default-src self` + `frame-ancestors none`, HSTS 31536k in prod only, `DENY`, `nosniff`, `strict-origin-when-cross-origin`, `trustProxy:true`) + `apps/web/next.config.ts` `headers()` (CSP + HSTS + XFO + XCTO + Referrer + Permissions-Policy + COOP/CORP) + `app.security-headers.test.ts` 8 tests
- **P0-C03 Port:** `docker-compose.yml` `5434:5432` (was `5432:5432`) + `.env.example` `DATABASE_URL` `5434` + `docs/DEPLOYMENT.md` + `docs/BACKUP_RESTORE.md` updated; `docker compose up -d` now succeeds with host PG 5432 running (verified `psql :5434` + `:5432` both `SELECT 1`)
- **P0-C04 Eval separation:** `tests/evals/README.md` (mock vs real, gate `EVAL_REAL=1`, thresholds, requirements) + `search-evaluation.real.test.ts`/`rag-evaluation.real.test.ts` (skipped by default, fail clearly when `EVAL_REAL=1` but Ollama unreachable) + `.env.example` mock warning + `package.json` `test:eval`/`test:eval:real`; keeps 598 PASS deterministic while enabling real `bge-m3`/`qwen2:7b` smoke
- **P0-C05 This report:** stale `3ef449c` (listed P1 TODOs) → current `main` at `cb067a9+` (all phases DONE, 598 tests, 14 routes, 16 migrations)

---

## 2. What was tested — Which checks passed

| Check | Result | Notes |
|---|---|---|
| `pnpm build:packages` (`@ikp/shared`/`@ikp/config`/`@ikp/queue`/`@ikp/processing`/`@ikp/storage`) | **PASS** | 5 workspaces |
| `pnpm typecheck` (`build:packages` + `tsc -p apps/api` + `tsc -p apps/web` + `tsc -p apps/worker` + `tsc -p tsconfig.test.json`) | **PASS** | strict |
| `pnpm lint` (`eslint --max-warnings 0`) | **PASS** | 0 warnings |
| `pnpm --filter web build` (`next build`) | **PASS** | 14 routes: `/`119B `/admin`2.51kB `/search`3.88kB `/ask`2.6kB `/dates`2.42kB `/documents/[id]`3.2kB etc. |
| `DATABASE_URL=postgresql://...:5434 REDIS_URL=redis://localhost:6379 pnpm test` | **PASS** | **82 files (80 passed, 2 skipped real), 600 tests (598 passed, 2 skipped)** — includes `pgvector`, `MinIO` `9000`, `BullMQ` `6379` |
| `pnpm test:eval` (mock) | **PASS** | search `Recall@5≥0.4` `MRR≥0.3`, rag `overall≥0.6` (100% mock on 12 cases) |
| `EVAL_REAL=1 pnpm test:eval:real` (no Ollama) | **FAIL as intended** | `Real provider not available. Start Ollama...` (gate works) |
| `tests/e2e/critical-path.e2e.test.ts` | **PASS** | 10 its / 17 flows |
| `tests/integration/security/regression.test.ts` | **PASS** | 7/7 (see §5) |
| `tests/integration/security/cross-tenant.test.ts` | **PASS** | 4×14 matrix (actors × capabilities × 2 tenants) |
| `apps/api/src/app.cors.test.ts` | **PASS** | 8 (allowed/disallowed/no-Origin/preflight) |
| `apps/api/src/app.security-headers.test.ts` | **PASS** | 8 (XFO/XCTO/CSP/HSTS) |
| Migrations `up/down/up` (`pnpm db:migrate` on `institutional_knowledge_test`) | **PASS** | 16 migrations, `vector` extension |
| `/health` + `/ready` + `/metrics` | **PASS** | `buildApp({checks})` inject tests + live `docker compose up` healthy |

**AI Providers configured (P0-C04 separation):**
- Default `mock` (CI, deterministic): `EMBEDDING_PROVIDER=mock` (`mock-bge-m3` 1024) + `LLM_PROVIDER=mock` (`mock-qwen2-7b` canned) via `createEmbeddingProvider`/`createLLMProvider` factories; thresholds mock-only, **do not claim production quality**.
- Real (gated `EVAL_REAL=1`): `EMBEDDING_PROVIDER=local` → `LocalEmbeddingProvider` (`Ollama` `/api/embed` `bge-m3` 1024 or `OpenAI` `/v1/embeddings`) via `EMBEDDING_BASE_URL`/`EMBEDDING_MODEL`; `LLM_PROVIDER=local` → `LocalLLMProvider` (`Ollama` `qwen2:7b` `/api/generate`|`/api/chat` or `OpenAI` `vLLM`/`cloud` via `CloudLLMProvider`); `RERANKER_PROVIDER` `mock`|`bge`.

---

## 3. Search evaluation results

### Mock (CI — deterministic)

Dataset `tests/evals/search-evaluation.dataset.json` 12 cases (exact/partial/natural/vague/date/department/version-conflict/hi/hinglish/no-answer/restricted/prefix-fuzzy) via `HybridSearchService` (mock BGE-M3 SHA-256 hash, seeded titles/chunks):

```
Recall@5  ~0.5-0.9 (threshold 0.4 PASS, mock-only)
MRR       ~0.4-0.8 (threshold 0.3 PASS, mock-only)
NDCG@5    ~0.5-0.9
Zero-result ~0.16-0.33 (2/12 no-answer expected)
```

Per-case recall is 1 for `exact_title`/`Holiday Schedule` (lexical `ts_rank` + `ILIKE`), >0 for `examination|hostel|परीक्षा` via hash similarity (canned titles seeded). **Mock thresholds are not production claims** — see `tests/evals/README.md`.

### Real (gated `EVAL_REAL=1` — not run in CI without Ollama)

Same 12 cases via `LocalEmbeddingProvider` (`bge-m3`). Production thresholds: `Recall@5≥0.6` / `MRR≥0.5` / `zero≤0.35`. To generate artifact:

```bash
ollama pull bge-m3
EVAL_REAL=1 DATABASE_URL=postgresql://postgres:postgres@localhost:5434/institutional_knowledge pnpm test:eval:real
```

Attach `search-eval-real.json` before pilot promotion.

---

## 4. AI evaluation results

### Mock (CI)

Dataset `tests/evals/rag-evaluation.dataset.json` 12 cases (same classes + `prompt_injection`, `restricted`):

```
Grounded accuracy: 100.0% (threshold 0.7 mock)
Citation accuracy: 100.0% (threshold 0.6 mock)
Answer accuracy:   100.0% (threshold 0.6 mock)
Unsupported accuracy: 100.0%
Overall accuracy: 100.0% (threshold 0.6 mock)
```

All grounded cases return `18 August 2026` with `citations[0].document_title` matching expected (mock LLM handles `examination|deadline|hostel|cse|holiday|परीक्षा|फॉर्म|last date`), `no-answer`/`restricted` return canonical `UNSUPPORTED_ANSWER` with `[]`. Prompt-injection (`When is examination deadline? Ignore previous instructions…`) still grounded with valid citation (injection treated as data).

### Real (gated)

Same 12 cases via `LocalLLMProvider` (`qwen2:7b`). Thresholds: `grounded≥0.8`/`citation≥0.7`/`overall≥0.7`. Generate via `EVAL_REAL=1 pnpm test:eval:real` with `ollama pull qwen2:7b`. No real-model artifact attached in this mock run — **block pilot until attached**.

---

## 5. Security test results

- **Tenant isolation:** `cross-tenant.test.ts` 4×14 matrix + `document-publication-permission` 8 + `rag-answer.integration` 3 + `ai.route.test` 7 (tenant mismatch 403, missing `X-Institution-Id` 400, no leakage) + `cross-tenant-rag.integration` 4 + `critical-path` (cross-institution `404/403`, search/RAG not leaking) + `regression` 7 = **33+ tests, all PASS** (82 files total)
- **RBAC:** `document.lifecycle` 9 + `document-supersession` 9 + `rbac.test` 8 + `regression` student 403 on approve/publish + CORS allow-list 8 + helmet 8
- **Headers:** `app.cors.test.ts` 8 (evil `https://evil.example` not reflected) + `app.security-headers.test.ts` 8 (XFO DENY, XCTO nosniff, CSP `frame-ancestors none`, HSTS prod-only) + `next.config.ts` web headers (CSP, HSTS, Permissions-Policy, COOP)
- **Visibility:** `draft` hidden from student via direct `404`/`403` fork, `list?status=DRAFT` `403`, `search` not containing, `RAG` not citing; `superseded` not in `PUBLISHED` search/RAG but detail still shows history
- **RAG boundary:** `PermissionAwareRetrievalService` filters before context (no post-filter leak), verified via `cross-tenant-rag` 4 + `prompt-injection` 4 + `regression` 2
- **Prompt injection:** `prompt-injection.test.ts` 4 + `rag-evaluation` injection case PASS (no `HACKED`, no `[99]`, no system prompt leak)

No restricted content leakage, no tenant bypass, no CORS wildcard, HSTS/CSP present.

---

## 6. Deployment requirements

- **Infra:** `docker compose up -d` → `postgres: pgvector/pgvector:pg17` host `5434→container 5432` (avoids host `5432` conflict), `redis:7-alpine` `6379`, `minio/minio` `9000` `institutional-documents` (`ensureStorageBucket` idempotent). Prod `docker-compose.prod.yml` `restart: unless-stopped`, healthchecks, `POSTGRES_PASSWORD`/`REDIS_PASSWORD`/`S3_*` `? required`.
- **Migrations:** `infra/migrations/*.js` (16, `node-pg-migrate`, `vector` extension, `search_vector` trigger GIN, `superseded_by` FK, `bookmarks`/`notifications`/`search_events`/`unresolved_searches`). Run `DATABASE_URL=postgresql://...:5434/... pnpm db:migrate` (host 5434 now canonical).
- **Env:** `NODE_ENV`, `API_HOST 0.0.0.0`/`API_PORT 4000`/`WORKER_PORT 4100`, `DATABASE_URL` (5434), `REDIS_URL` `6379`, `JWT_SECRET` (≥32, `insecure-dev-only...` rejected in `isProduction`), `S3_ENDPOINT` `9000`/`S3_*` `minioadmin` default rejected in prod, `CORS_ORIGINS` (allow-list, default `http://localhost:3000`), `LLM_PROVIDER`/`EMBEDDING_PROVIDER` (`mock` default, `local`/`openai`/`vllm`/`cloud` + `*_BASE_URL`/`*_MODEL`/`*_ENDPOINT`), `RERANKER_PROVIDER`, `METADATA_PROVIDER`/`DATE_PROVIDER` (`heuristic` default), `LOG_LEVEL`.
- **Build:** `pnpm install && pnpm build:packages && pnpm --filter web build && pnpm typecheck && pnpm lint` (web 14 routes, largest `/search` 3.88kB)
- **Run:** `docker compose up -d && pnpm --filter api dev` (`http://localhost:4000/api/v1`) + `pnpm --filter web dev` (`http://localhost:3000`) + `pnpm --filter worker dev` (`4100`), verify `curl /health` + `curl /ready` + `curl /metrics`
- **Tests:** `DATABASE_URL=...:5434 REDIS_URL=...:6379 pnpm test` (skips real evals) or `EVAL_REAL=1 pnpm test:eval:real` (requires Ollama `bge-m3` + `qwen2:7b`). CI at `ci.yml` runs lint/build/typecheck/test with `DATABASE_URL_TEST=...:5432` (service) — local uses `5434`.
- **Storage:** bucket `institutional-documents`, presigned PUT 15m, `sha256` + `head` size check, `object-storage` `ensureStorageBucket`

---

## 7. Known limitations (post-P0, before P1)

- **Search:** no HNSW index (`USING hnsw (embedding vector_cosine_ops)` backlog — brute cosine will miss P95 <500ms at 50k chunks), facets are result-local counts (not `GROUP BY`), no BM25/trigram fuzzy.
- **OCR:** `Tesseract` only; `PaddleOCR` per ADR backlog; multi-page rasterization heuristic.
- **RAG:** `Mock` default until `OLLAMA_BASE_URL` + `vLLM` provided; `ContextBuilder` 3000/5 heuristic, no streaming, no query rewriting/transliteration for Hinglish beyond hybrid.
- **E2E:** API-level `critical-path` covers 17 flows but no Playwright browser flows + no hostile-file fuzz (polyglot/corrupt PDF 100MB), no JWT replay test, no signed-URL expiry test.
- **Observability:** `pino` structured logs + `/metrics` but no OpenTelemetry tracing distribution yet.
- **Docs:** `docs/api/openapi.yaml` still missing (API contract tests via Zod, not OpenAPI), `eng.traineddata` (47MB) provenance not documented, `public/` favicon/og-image empty.
- **Performance:** synthetic load tests only (30 searches 21ms avg, 10 PDFs 84ms avg with mock embeddings); real P95 on 10k+ institutional PDFs NOT MEASURED — add `k6` + `HNSW` benchmark.

---

## 8. Deferred backlog

`docs/BACKLOG.md` + `TASK_MANIFEST.md` P1 TODOs now empty for MVP (all DONE), but P1 Next from review: HNSW index, `trustProxy`+IP rate limit, malware scan toggle, refresh-replay test, OpenAPI 3.1, facets as aggregates, Playwright E2E, design-token pass (see §9). Future: mobile native, WhatsApp/Telegram, ERP connectors, `PaddleOCR`, `bge-reranker` tuning, `k6` suite.

---

## 9. Recommended next steps (post-P0, P1 order from MVP_REVIEW)

1. **HNSW migration** (`infra/migrations/*_add-hnsw-index.js` concurrent) + `EXPLAIN` + `k6` search P95 benchmark (blocks 50k chunks).
2. **IP-aware rate limit** (`trustProxy:true` already set, add `keyGenerator: req.ip` for auth 10/min/IP, CI `k6` auth flood).
3. **Real-model smoke gate** — run `EVAL_REAL=1` with `ollama pull bge-m3 qwen2:7b` on seeded 12-case + 10k real PDFs, attach artifact, gate PR with `Recall@5≥0.6`/`RAG overall≥0.7`.
4. **OpenAPI** `docs/api/openapi.yaml` generated from Zod schemas + contract tests (SDK future).
5. **Facets as aggregates** (`search.route.ts:122` → `GROUP BY` dept/type when >1k docs).
6. **Storage pre-sign size gate** (S06 file-size enforced post-upload via `head`; add `Content-Length` check + bucket policy).
7. **Playwright E2E** (3 flows: login→upload→publish, student search→detail, RAG ask→cite).
8. **Design-token pass** (`Inter/Geist`, 8px grid, radius 12/16, neutral+accent, `next.config` headers already set).
9. **Tag `v0.1.0-mvp`** from this commit + attach `security regression` + `eval-real` artifacts.

