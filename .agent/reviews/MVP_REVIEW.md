# MVP Review — Institutional Knowledge Platform

**Date:** 2026-08-22  
**Reviewer:** Senior Staff Engineer / Product Architect / Security Engineer / QA Lead / AI Search Engineer (pre-release audit)  
**Branch audited:** `main` at `60cefa6` (merge #79)  
**Environment for verification:** `DATABASE_URL=postgresql://postgres:postgres@localhost:5434/institutional_knowledge` (`ikp-pgvector-test-5434` pgvector/pg17 `vector(1024)`), `REDIS_URL=redis://localhost:6379`, MinIO `http://localhost:9000`, Node >=22, pnpm 10.0.0, Fastify + Next.js 15.5, Vitest 3.2  
**Tests executed:** `DATABASE_URL=...:5434 REDIS_URL=...:6379 pnpm test` — **78 files, 582 tests, 0 failures** (duration ~23s). Includes Docker-backed Postgres/pgvector, MinIO, BullMQ.

---

## Executive Summary

**Verdict: MVP READY WITH CONDITIONS (do not deploy to production without P0 conditions resolved; safe for limited pilot / staging).**

The MVP is substantially complete and unusually well-engineered for an autonomous build. All task-manifest P0 and P1 items are marked DONE and the codebase backs most of those claims with real code + passing tests. The critical user journey works end-to-end:

`Admin login → create document → signed upload → head/size/mime validation → confirm → enqueue document.process → extraction/OCR/chunk/embed → submit → approve → publish → student search (hybrid lexical+vector) → open detail → see summary/dates/versions → ask AI (permission-aware retrieval → context builder → LLM → citations + unsupported fallback) → bookmark/share/related → notifications/email/deadlines`

Multi-tenant isolation is enforced server-side via `X-Institution-Id` header validated against `institution_memberships` (never trusted directly) — see `apps/api/src/common/auth/authorize.ts:21-87` — and is covered by a cross-tenant matrix plus RAG-boundary tests. Search, hybrid retrieval, and RAG are implemented as specified (not LLM-only), with evaluation datasets.

Conditions that block a production release today are operational/security, not product completeness: permissive CORS, missing security headers, host-port conflict that prevents `docker compose up` on standard dev machines, mock AI provider as default (no real-model smoke in CI), and a stale `docs/FINAL_IMPLEMENTATION_REPORT.md`. None of these are architectural defects, but each is material for production.

If the three P0 conditions below are fixed and a production smoke with a real embedding/LLM provider passes, the platform can be promoted to a controlled institutional pilot.

---

## Overall Score (0–10, independent)

| Area | Score | Rationale |
|---|---|---|
| Product | 8 | Core document lifecycle, search, viewer, important dates, bookmarks, notifications, analytics, admin — all present. Feed personalization and mobile polish are thin. |
| Architecture | 8 | Modular monolith + workers (API / web / worker / @ikp/* packages) matches `TECHNICAL_SPEC.md`. Provider abstraction is clean. Queue is Redis/BullMQ with idempotent jobs. |
| Security | 6 | Tenant isolation and RBAC are strong. CORS `origin:true`, no helmet/HSTS, no malware scan beyond mime/size, and `JWT_SECRET` dev default are gaps (see Security Findings). |
| Search | 7 | Full-text (`tsvector` GIN) + pgvector hybrid (0.4/0.6) works; filters/facets, analytics, unresolved, reranker (mock/bge) present. Real multilingual quality not measured with production embeddings. |
| AI/RAG | 7 | Permission-aware retrieval → context builder → LLM → citations + unsupported answer is correct. Cloud LLM adapter now exists. RAG evals pass on mock LLM (100%), which gives false confidence without a real-model eval. |
| UI/UX | 6 | Functional, accessible baselines (labels, aria, focus), but design is generic (AI-dashboard aesthetic), not the calm institutional language in `UI_UX_DESIGN.md`. Few loading/empty/error states are polished; mobile nav is minimal. |
| API | 8 | REST `/api/v1`, consistent envelope, Zod validation, rate limits per family, error codes. Spec coverage is high; OpenAPI artifact is not yet published. |
| Database | 8 | 16 migrations, FKs, unique constraints, `vector(1024)`, GIN, processing_status/superseded_by/bookmarks etc. No unsafe destructive migrations observed. |
| Testing | 8 | 582 tests including integration/security/e2e/load/eval. Tests are meaningful (not just existence). Missing: Playwright E2E and hostile-file fuzz tests. |
| Performance | 5 | Load tests for search (30 concurrent, 21ms avg) and processing (10 PDFs 84ms avg) exist but are synthetic/mock-embedding. P95 latency under real load is NOT MEASURED. |
| Deployment | 6 | `docker-compose.yml` + `docker-compose.prod.yml` + backup/restore scripts + deployment guide exist. Host-port conflict + mock defaults + secrets handling keep it at PARTIALLY READY. |
| Documentation | 5 | Specs are strong. `PROJECT_STATE.md` and `docs/FINAL_IMPLEMENTATION_REPORT.md` (at `3ef449c`) are stale vs `main` at `60cefa6`; manifest is now authoritative. |

No blind averaging: Security, Performance, Deployment, and Documentation are the release-limiting scores.

---

## Requirements Matrix

Source: `PRD.md` §9 FR-001…FR-015 + `TASK_MANIFEST.md`. Evidence paths are representative.

| Requirement | Status | Evidence | Gap | Severity |
|---|:---:|---|---|:---:|
| FR-001 Tenant Isolation | PASS | `authorize.ts:56-73` validates header vs membership; `tenant-repository.ts`; `tests/integration/security/cross-tenant.test.ts` (4×14 matrix); `cross-tenant-rag.integration.test.ts` | None | P0 |
| FR-002 Document Upload (signed flow, mime, size) | PASS | `documents.service.ts:30-39,210-371` (ALLOWED_MIME, 25MB, sha256, presignPut, head check, idempotent confirm); `s3-object-storage.ts`; `documents.route.test.ts` | MIME list excludes `application/octet-stream` correctly; no ClamAV scan (documented fallback) | P1 |
| FR-003 OCR (scanned PDFs, page refs, confidence) | PARTIAL | `packages/processing/src/tesseract-ocr.ts`, `text-extractor.ts`, `scanned-pdf.integration.test.ts:4` (native vs raster OCR); `processing.service.ts` | Tesseract only; PaddleOCR per ADR not integrated; rasterization for multi-page scans is heuristic, not production-grade | P1 |
| FR-004 Metadata Extraction (title/type/dept/dates/tags, editable) | PASS | `heuristic-metadata-extractor.ts`, `llm-metadata-extractor.ts`, `metadata-factory.ts` (METADATA_PROVIDER), `documents.service.ts:540-591` updateMetadata | Heuristic default; LLM path now exists via `P3-006` | P1 |
| FR-005 Publishing Workflow (DRAFT→…→ARCHIVED, SUPERSEDED) | PASS | `documents.service.ts:145-192,594-707` (`canTransitionDocument`, TRANSITION_RULES, per-transition capability); lifecycle route tests (9) | None | P0 |
| FR-006 Search (prefix/fuzzy/full-text/metadata/hybrid) | PASS | `search.route.ts:51-103`, `hybrid-search.service.ts` (0.4/0.6 merge), `vector-search.repository.ts`, migrations `add-document-search-vector.js` | Facets are result-count only, no DB aggregation; fuzzy via `tsvector` + ILIKE hybrid, not trigram | P0 |
| FR-007 Natural Language / Vague Search | PASS | `hybrid-search.integration.test.ts` (exact + semantic identical via hash), `search-evaluation.dataset.json` includes vague/hinglish/hindi | Quality depends on embeddings; mock embedding masks real recall | P0 |
| FR-008 Search Results (title/type/date/meta/summary/highlights/version) | PARTIAL | `search.route.ts:136-149` (title/score/summary null, match_reasons, is_current); `hybrid-search.service.ts` match_reasons | `summary` always null in search (detail-only), `match_reasons` token-based, no highlight snippets | P2 |
| FR-009 Versioning / History | PASS | `document-versions.repository.ts`, `documents.repository.ts:superset`, `GET /documents/:id/versions`, `versions/page.tsx`, `document-supersession.route.test.ts` (9) | `is_current` computed as `PUBLISHED && !superseded_by` (spec `SUPERSEDED` allowance met) | P0 |
| FR-010 Related Documents | PASS | `related-documents.service.ts`, `related-documents.route.ts`, `P6-006` tests (4) | Heuristic semantic similarity; no explicit admin relationships UI | P2 |
| FR-011 Bookmarks | PASS | `bookmarks.repository.ts`, `bookmarks.route.ts: POST/GET/DELETE`, migration `create-bookmarks.js` (unique user+doc), `bookmarks.route.test.ts` (6) | UI at `apps/web/src/app/bookmarks/page.tsx` minimal (no collections) | P1 |
| FR-012 Notifications (new/updated/deadline, in-app+email) | PASS | `notifications.service.ts`, `notifications.route.ts`, `email-adapter.ts`, `relevance-rules.ts`, `deadline-reminders.ts`, `P7-001…006` merged #70-75 | No push/WhatsApp (out of MVP scope) | P1 |
| FR-013 Audit Log | PASS | `audit-log.repository.ts`, `audit.route.ts`, `audit.service.ts` (record on create/upload/transition/supersede) | No retention policy UI | P0 |
| FR-014 AI Answers (grounded, cited, current-version preference, refuse) | PASS | `rag-answer.service.ts` (retrieve→build→LLM→[n] validation→grounded/citations), `citation.ts`, `context-builder.service.ts` (tenant+PUBLISHED), `ai.route.ts` | Refusal string matches spec (`UNSUPPORTED_ANSWER`); citation validation enforces retrieved-only | P0 |
| FR-015 Search Analytics | PASS | `search-analytics.repository.ts`, `search-analytics.route.test.ts` (4), `analytics.route.ts` (`/admin/analytics/*` overview/searches/popular/unresolved) | Search-to-open not yet joined with click events; zero-result aggregation exists | P1 |
| P0-001…P0-008 Foundation | PASS | `pnpm` workspaces, TS strict, ESLint/Prettier, CI, `.env.example`, Compose, health | None | P0 |
| P1-001…P1-008 Identity | PASS | migrations `institutions/users-memberships/departments`, auth `auth.route.ts`, RBAC `@ikp/shared/rbac.ts` | Placeholder MFA not required for MVP | P0 |
| P2-001…P2-008 Documents | PASS | `documents.js`+`document-metadata.js`+`audit-logs.js`, storage abstraction, upload flow, CRUD | None | P0 |
| P3-001…P3-010 Processing | PASS | BullMQ queue, pdf-text-extractor, tesseract-ocr, orchestration, heuristic+LLM metadata/date, chunker (500/75), vector(1024), scanned-PDF integration | OCR prod gap noted | P0 |
| P4-001…P4-006 Publishing | PASS | review queue, approve/publish/archive/supersede, version history UI `versions/page.tsx`, approval queue UI, permission tests (8) | None | P0 |
| P5-001…P5-014 Search | PASS | chunk storage, embedding interface+local+mock, gen/store, FTS, vector, hybrid, reranker (mock+bge `local-reranker-provider`), search API, UI, filters/facets, analytics, unresolved, eval | Real reranker quality not benchmarked | P0 |
| P6-001…P6-007 Consumption | PASS | detail API/page, summary (`extractSummary` + `extra.summary`), dates API/UI (`dates.service.ts`, `dates/page.tsx`), bookmarks, related, share-links | Summary heuristic not AI-grade without LLM provider | P1 |
| P7-001…P7-006 Notifications | PASS | schema, service, in-app, email, relevance, deadline reminders — all merged | None | P1 |
| P8-001…P8-013 Institutional AI | PASS | LLM interface + local + cloud (`cloud-llm-provider.ts`), permission-aware retrieval, context builder, RAG service, citations, unsupported, /ai/ask, Ask UI, prompt-injection (4), RAG eval (12), cross-tenant RAG (4) | Evaluation on mock only | P0 |
| P9-001…P9-008 Hardening | PASS | E2E `critical-path.e2e.test.ts` (10/17 flows), security regression (7), load search/processing, metrics/tracing, backup/restore, deploy automation | Playwright missing, perf NOT MEASURED on prod data | P0 |
| Env Matrix (local/test/staging/prod) | PARTIAL | `ENVIRONMENT_MATRIX.md`, `.env.example` (all providers), `docker-compose.yml`+`.prod.yml`, metrics `/metrics` | Production secrets manager + HSTS not enforced | P1 |

---

## Critical Findings (P0)

### P0-C01 — CORS permissive (`origin: true`) — Credentialed cross-origin abuse
- **Component:** `apps/api/src/app.ts:52-54`
- **Impact:** Any origin can make credentialed requests. Combined with `Authorization: Bearer` + `X-Institution-Id`, a phishing site can drive a logged-in user's browser to exfiltrate tenant-scoped data if cookies are ever introduced; even without cookies, it widens the attack surface for CSRF-adjacent flows and violates `SECURITY_CHECKLIST.md` CORS restrictions.
- **Recommendation:** Replace with an allow-list (`CORS_ORIGINS` env, default `http://localhost:3000`), handle preflight explicitly, and add tests.

### P0-C02 — No security headers (helmet/HSTS/CSP/X-Frame-Options) — Clickjacking & downgrade risk
- **Component:** `apps/api/src/app.ts` (no `@fastify/helmet`), `apps/web` (no `headers()` config)
- **Impact:** Missing `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Content-Security-Policy`. Institutions deploying behind TLS-terminating proxies will not get HSTS; document sharing (`/share`) is vulnerable to clickjacking.
- **Recommendation:** Add `helmet` with env-aware CSP/HSTS, add web `next.config.js` headers, verify with `curl -I` tests.

### P0-C03 — `docker-compose.yml` host-port conflict (5432 in use) breaks local & CI bootstrap
- **Component:** `docker-compose.yml:9` (`5432:5432`)
- **Impact:** Any host running Postgres 18 (this runner does on `127.0.0.1:5432`) fails `docker compose up -d` with `address already in use`. Prior workaround was a separate `ikp-pgvector-test-5434` on 5434, but onboarding docs still claim `5432`. This is a deployment readiness blocker and contradicts `DEFINITION_OF_DONE.md` reproducibility.
- **Recommendation:** Change compose to `"5434:5432"` with `DATABASE_URL` override docs, or document host-PG shutdown and use `host.docker.internal` detection. Add `bin/bootstrap.sh` that checks port availability.

### P0-C04 — Mock AI provider is the default — RAG/search evals give false confidence
- **Component:** `.env.example` (`LLM_PROVIDER=mock`, `EMBEDDING_PROVIDER=mock`), `packages/processing/src/mock-*`, `tests/evals/*`
- **Impact:** CI passes with deterministic `SHA256`-hash 1024-dim embeddings and canned `18 August 2026` answers. Search `Recall@5`/`MRR` and RAG `100%` scores in `docs/FINAL_IMPLEMENTATION_REPORT.md` do not reflect real model quality. A regression to real `bge-m3`/`qwen2:7b` could silently degrade recall.
- **Recommendation:** Keep mock for unit tests, but CI must also run a smoke with `local` providers (even if gated) or mark eval thresholds as mock-only. Block production promotion until a real-model eval artifact is attached.

### P0-C05 — `docs/FINAL_IMPLEMENTATION_REPORT.md` stale — manifest vs report divergence misleads release decision
- **Component:** `docs/FINAL_IMPLEMENTATION_REPORT.md` (references `main` at `3ef449c`, lists P1 TODOs) vs `TASK_MANIFEST.md` (all DONE) vs actual `main` at `60cefa6`
- **Impact:** The authoritative completion gate doc is outdated. An auditor relying on it would undercount shipped features (bookmarks/related/share/analytics/etc. merged #62-79) and mis-evaluate risk.
- **Recommendation:** Regenerate final report at release tag (template in `INSTRUCTIONS.md` §30), include commit, migration hash, and eval metrics from the tagged build.

---

## High Priority Findings (P1)

- **P1-H01 File upload path traversal / storage key injection — mitigated but filename sanitization not explicit.** `storage-keys.ts` constructs keys via `originalFileKey({institutionId, documentId, version}, ext)` and extension is mapped from mime, not filename. Good. But `mime_type` is client-supplied; validation is server-side (`ALLOWED_MIME_TYPES` at `documents.service.ts:30-39,855`). Add filename sanitization for any future `Content-Disposition` handling and reject `application/octet-stream` masquerading.
- **P1-H02 No malware scanning — documented fallback but no ClamAV integration or explicit operational toggle.** `SECURITY_CHECKLIST.md` requires malware scan or explicit fallback. Current fallback is size/mime/head check plus sha256. Add a `MALWARE_SCAN=off|clamav|provider` flag and fail-open/closed policy doc.
- **P1-H03 Rate limiting is global-muted for 404/anon probes — `auth` 10/min/IP not enforced per IP.** `apps/api/src/app.ts:56-62` sets global 300/min but per-route `auth` limit is via plugin config without IP keyGenerator override. Brute force on `/auth/login` still limited but not IP-isolated under Fastify's default `req.ip` behind proxy. Add `keyGenerator: (req) => req.ip` and `trustProxy`.
- **P1-H04 Refresh token rotation / revocation not hardened — JWT 15m/30d but no reuse detection.** `refresh-token.repository.ts` stores tokens; rotation exists but reuse detection + lockout after reuse is not tested. Add integration test for token replay.
- **P1-H05 Search facets are synthetic (result-only counts) — not DB aggregates.** `search.route.ts:122-135` counts departments/types from returned results only (max 20). Admin analytics will undercount. Replace with `GROUP BY` facets query once data volume >1k.
- **P1-H06 No HNSW index on `document_chunks.embedding` — brute cosine scan.** Migration `create-document-chunks.js` uses `vector(1024)` without `USING hnsw (embedding vector_cosine_ops)`. At >50k chunks, P95 search will exceed 500ms. Add concurrent index migration and benchmark.
- **P1-H07 Prompt injection treated as data — correct, but no content-sanitization for citation quote display.** `rag-answer.service.ts` correctly ignores system instructions in chunks, but `citation.ts:quote` is rendered verbatim in Ask UI. If a chunk contains `[[` markdown or HTML, it could affect rendering. Sanitize quote before render.
- **P1-H08 OCR rasterization not production-grade — scanned PDFs with images fail silently to `FAILED` without user surfacing.** `processing.service.ts` sets `processing_status=FAILED` but `processing-status.route.ts` only shows status; no retry UI auto-poll beyond `retry-processing`. Add `P3-009` status UI polling and DLQ.
- **P1-H09 Missing OpenAPI artifact — `API_SPEC_SHEET.md` promises OpenAPI 3.1 source of truth.** `docs/api/openapi.yaml` does not exist; SDK generation is not gated. Add openapi generation from Zod schemas and contract tests.

---

## Medium Priority Findings (P2)

- **P2-M01 `X-Institution-Id` required on every tenant route — spec says `400 VALIDATION_ERROR` for missing header, implemented correctly, but header is not documented in Swagger and error message leaks no data (good) but could be more actionable.** Add `examples` and `WWW-Authenticate` hint.
- **P2-M02 `list?status=DRAFT` forbidden for students is enforced, but `GET /documents/:id` for a draft returns 404 (not 403) — intentional to avoid leakage, but inconsistent with `GET /documents?status=DRAFT` which returns 403.** Document the behavior and add a 404-vs-403 consistency ADR.
- **P2-M03 `GET /search` `visibleStatusesForRole` restricts students/faculty to `PUBLISHED` only, but `SUPERSEDED` is still retrievable via `GET /documents/:id` (historical).** Align search vs detail precedence docs; consider penalizing superseded in ranking (currently `is_current` only, no score penalty).
- **P2-M04 `share-links.service.ts` generates share tokens without explicit TTL or revocation UI.** Check `share-links.route.test.ts` for expiry; add `expires_at` + audit.
- **P2-M05 `deadline-reminders.ts` interval is not covered by `P9-005` metrics — no `queue depth` metric for reminders.** Add `reminders.queued` counter.
- **P2-M06 `apps/web` has no `next.config.js` `headers()` / `images` hardening, no `eslint` for a11y (`jsx-a11y`).** Add `eslint-plugin-jsx-a11y`.
- **P2-M07 `eng.traineddata` (47MB) is committed to repo root — violates `GIT_WORKFLOW.md` generated/runtime ignore.** Move to `infra/ocr/` or document as intentional versioned artifact with checksum.
- **P2-M08 `public/` is empty — no favicon/og-image; share link previews will be blank. Minor but affects institutional polish.

---

## Low Priority Findings (P3)

- Home page is placeholder marketing copy (`Working title` disclaimer) — needs institutional branding hook before pilot.
- `apps/web/src/app/admin/documents` admin UI uses server components but no `loading.tsx`/`error.tsx` boundaries for each segment (per `UI_UX_DESIGN.md` §23).
- `search/page.tsx` filter drawer for mobile exists but no `z-index` trap — focus remains on background content.
- `analytics.route.ts` returns raw counts without timezone handling beyond UTC RFC3339 — add `Asia/Kolkata` display hint per `ENVIRONMENT_MATRIX.md`.
- Minor: `packages/processing/src/chunker.ts` uses 500/75 but `TECHNICAL_SPEC.md` says 300–700/10–20% — within range but not configurable via env.

---

## Security Findings

| ID | Issue | Component | Exploit / Impact | Severity | Recommendation |
|---|---|---|---|---|---|
| S01 | CORS `origin:true` | `apps/api/src/app.ts:52` | Any origin can call tenant APIs; widens CSRF/phishing | P0 | Allow-list via `CORS_ORIGINS` |
| S02 | No helmet/HSTS | `apps/api/src/app.ts`, `apps/web` | Downgrade, clickjacking, MIME-sniff | P0 | Add `@fastify/helmet` + web headers |
| S03 | Dev `JWT_SECRET` allowed in prod if env missing? | `packages/config/src/schemas.ts` | Token forgery | High | `schemas.ts` already rejects `insecure-dev-only` when `NODE_ENV=production` — verify in prod smoke (currently correct) |
| S04 | No malware scan | `documents.service.ts` | Malicious PDF can enter OCR pipeline | High | Add `MALWARE_SCAN` toggle + doc |
| S05 | No rate-limit keyGenerator for auth | `app.ts:56` | IP sharing behind proxy bypasses limit | High | `keyGenerator: req.ip`, `trustProxy` |
| S06 | File size enforced post-upload via `storage.head` | `documents.service.ts:315-323` | Large file is already in object storage; DOS on storage quota | Medium | Reject oversize pre-sign or via `Content-Length` check on PUT + bucket policy |
| S07 | Embeddings gated by tenant+RAG PUBLISHED — PASS | `permission-aware-retrieval.service.ts`, `context-builder.service.ts:8` | No leakage observed | — | Keep; add test for `IN_REVIEW` leakage |
| S08 | Prompt injection isolated — PASS | `prompt-injection.test.ts:4` | `[HACKED]` not rendered | — | Keep; add doc-text-as-untrusted policy |

---

## Search Evaluation

- **Implemented:** PostgreSQL full-text (`tsvector` trigger + GIN) + pgvector (`vector(1024)`) + `HybridSearchService` (lexical 0.4 / semantic 0.6, max-normalized, `match_reasons`, freshness tie-breaker) + optional `Reranker` (`mock` + `bge` local). See `hybrid-search.service.ts`, `vector-search.repository.ts:cosine`.
- **What works:** Exact title, partial, prefix-fuzzy, filtered (department/type/date), paginated. Recall is deterministic for exact queries via lexical path. Analytics, unresolved, facets, search analytics admin UI all wired.
- **What doesn't / gaps:** Recall quality on vague Hinglish/hindi not measured with real embeddings (mock hash gives synthetic 0.5–0.9 Recall@5 on 12-case dataset). No HNSW index; no BM25 tuning; facets are result-local; no query rewriting/transliteration.
- **Retrieval quality (mock):** `tests/evals/search-evaluation.dataset.json` 12 cases — thresholds `Recall@5≥0.4 PASS`, `MRR≥0.3 PASS` via `search-evaluation.runner.ts`. Real thresholds must be re-established with `bge-m3`.
- **Citation accuracy:** Not applicable to search; RAG citations are permission-filtered (PUBLISHED only).

---

## AI/RAG Evaluation

- **Model architecture:** `EmbeddingProvider` (`mock` SHA256 L2 + `local` Ollama/OpenAI batching) + `LLMProvider` (`mock` deterministic grounded + `local` Ollama/OpenAI + `cloud` adapter `cloud-llm-provider.ts`) + `RerankerProvider` (`mock` token-overlap + `local`/`bge`). Factory via env `LLM_PROVIDER`/`EMBEDDING_PROVIDER`/`RERANKER_PROVIDER`. See `packages/processing/src/*provider.ts`.
- **Retrieval:** `PermissionAwareRetrievalService` filters before context (no post-filter leak) — correct per `AGENTS.md` §11.3. `HybridSearchService` `20+20` candidates, `context-builder.service.ts` caps at 3000 tokens / 5 chunks, cites as `[n] Title (ID, Version, Page) + Score`.
- **Hallucination risks:** Low by design — `rag-answer.service.ts` validates `[n]` indices, rejects hallucinated citations, fail-closes to `UNSUPPORTED_ANSWER` (`I couldn't find…`). Risk remains if `MockLLM` is used in prod (canned answers).
- **Grounding:** Tested with 12-case `rag-evaluation.dataset.json` covering version-conflict, restricted, no-answer, prompt-injection. Mock eval scores 100% — not indicative of real model. Security-boundary tests (4 cases) + prompt-injection (4) all pass.
- **Failure modes:** LLM timeout not yet chaos-tested; `ContextBuilder` truncates silently; `Reranker` mock returns input order.

---

## UX Findings (vs `UI_UX_DESIGN.md`)

**Against spec §4–§25:**

- **Navigation:** Desktop header search + admin link exists; mobile bottom nav is missing (spec §4). Sidebar in `admin/layout.tsx` is minimal.
- **Home (§5):** Centered search with suggestions works (`page.tsx` form GET→/search), but no autofocus on desktop, no recent/suggestion dropdown, no `Important for you` / `Upcoming deadlines` personalization (deferred feed).
- **Search (§6–§8):** Result cards show title/type/date but summary is always null, `match_reasons` not styled as chips, `Why this matched` string; empty state now shows guidance but admin `Save as unresolved` is not inline (separate route `/search/unresolved`).
- **Detail (§9–§10):** `documents/[id]/page.tsx` shows current/superseded badge, versions table, dates card, summary — matches spec. PDF viewer is link-out, not embedded PDF.js (acceptable MVP).
- **Important Dates (§11):** `/dates` page with from/to filters + detail card matches spec; calendar month/week/list modes not implemented (list only).
- **Ask Institution (§14):** `/ask` page idle/loading/error/success, grounded badge, Sources `<ol>` with `[Open source]` — matches spec §14 rules (concise, cited, no confident answer without source).
- **Admin (§15–§18):** Analytics overview, review queue, upload flow with processing status, status badges with icons — good. No `Empty / Error States` illustrations (§23).
- **Accessibility (§20):** Labels, aria, keyboard nav present on search/admin; focus-visible styles exist but not audited with `axe`; touch target 44px not verified.
- **Polish:** Product feels functional but generic (white cards, default Next font). Needs `Inter/Geist` typography, 8px spacing, radius 12px, neutral + accent per §3 to feel institutional.

**Top UX fixes (ordered):**
1. Mobile bottom nav + filter drawer trap.
2. Search empty-state with admin unresolved CTA inline.
3. Detail PDF embed + metadata panel.
4. Design-token pass (typography/spacing/radius/accent).

---

## Performance Findings

### MEASURED
- `tests/load/search-load.test.ts`: 30 concurrent hybrid searches in 635ms (avg 21.2ms), 20 filtered in 211ms — via `DATABASE_URL=:5434` on this runner; not P95, not production data.
- `tests/load/processing-load.test.ts`: 10 PDFs concurrently in 842ms (avg 84.2ms), 5 long PDFs chunk+embed in 361ms — synthetic text, mock embeddings, no OCR raster cost.
- `pnpm --filter web build`: 12 routes (largest `/dates` 2.42kB) — build is fast.
- Tests: 582 tests in ~103s wall (transform+collect inclusive).

### INFERRED (no benchmark, engineering judgment)
- Without HNSW, vector scan is O(n); 50k chunks will miss P95 <500ms (lexical) / <1.5s (hybrid) targets in `PRD.md` §10.
- Tesseract on image PDFs ~1.8s for one raster (per `scanned-pdf.integration.test.ts` 1835ms) — will dominate worker latency at scale.

### NOT MEASURED (explicit)
- P95/P99 search latency on 10k+ real institutional PDFs.
- OCR throughput on mixed native/scanned corpus.
- Embedding latency for 700-token chunks via `bge-m3` on CPU vs GPU.
- API latency under 500 concurrent users.
- MinIO/S3 signed URL latency under load.
- Redis/BullMQ queue depth under backlog.
- Web Vitals (LCP/INP) on 3G.

**Recommend:** Add `k6` or `artillery` scripts for search (500 concurrent) and `pnpm bench:search` that seeds 10k docs before measuring.

---

## Test Coverage Gaps

Existing suite is strong (78 files/582 tests, E2E 10/17 flows, security 7 + matrix, load, eval). Missing meaningful coverage:

1. **Playwright/Cypress E2E** for browser flows (login→upload→search→detail→share on mobile/desktop) — current `critical-path.e2e.test.ts` is API-level (Fastify inject + DB), not browser.
2. **Hostile file fuzz** (corrupted PDF 100MB, `application/octet-stream` renamed to `.pdf`, zip bomb, HTML with `<script>`, polyglot) — mime/size happy paths covered, malformed not.
3. **JWT refresh replay** — no test that reusing an old refresh token is rejected and locker fires.
4. **Storage signed URL expiry** — no test that `presignPut` URL expires after 15m and `GET` with `?X-Amz-Expires` is denied post-expiry.
5. **HNSW vs brute regression** — search eval does not gate `vector_cosine_ops` index presence.
6. **Real-model RAG eval** — `rag-evaluation.runner.test.ts` uses mock; no gated `LLM_PROVIDER=local` smoke in CI.
7. **Backup restore verification** — `P9-006` scripts exist but no automated `up/down/up` + checksum test in CI.

---

## Technical Debt

### Acceptable MVP debt
- Mock providers as test doubles (kept, not shipped as prod).
- `summary` heuristic before LLM summary provider is enabled (acceptable until `qwen2:7b` is deployed).
- Facets as result-local counts (acceptable until >1k docs).
- No dedicated search cluster (per `ADR-001`, correct).

### Dangerous debt (must be scheduled)
- CORS `origin:true` + no helmet — easy to fix, high risk if deferred.
- Host-port conflict — breaks onboarding today.
- No HNSW index — will degrade silently with data growth.
- Mock-default deployment — risk of shipping mock to staging/prod if env is incomplete.

---

## Documentation Gaps

- `docs/FINAL_IMPLEMENTATION_REPORT.md` at `3ef449c` is behind `main` at `60cefa6` — regenerate and add commit hash, `pgm hash`, `pnpm test` counts, eval metrics from the tagged build, and `docker-compose.prod.yml` deploy steps.
- `PROJECT_STATE.md` snapshot (2026-08-21) lists `PHASE_9_DONE` but still references `feat/P6-004-important-dates` branch — verify against `git branch --show-current` (`main`, clean) and mark `P6-004` merged.
- `README.md` claims `docker compose up -d` on `5432` — update to `5434` or auto-detect.
- Missing `docs/api/openapi.yaml` (API spec sheet promises OpenAPI 3.1).
- Missing `docs/BACKLOG.md` entries for deferred P2 ideas (mobile native, WhatsApp, ERP connectors).
- `eng.traineddata` provenance not documented.

---

## MVP Release Decision

**Decision: READY WITH CONDITIONS (stage for pilot, not production).**

**Blockers to production (must fix before external users):**

1. **P0-C01 CORS** — replace `origin:true` with allow-list.
2. **P0-C02 Security headers** — add helmet/HSTS/CSP.
3. **P0-C03 Port conflict** — fix `docker-compose.yml:9` or onboarding.
4. **P0-C04 Real-model smoke** — attach a `bge-m3`/`qwen2:7b` (or cloud) eval artifact before pilot.
5. **P0-C05 Stale report** — regenerate final report at tag.

**Non-blockers (may ship to staging pilot):** P1-H06 HNSW, P1-H09 OpenAPI, P2-M08 previews.

---

## Recommended Remediation Plan (ordered P0→P3)

| # | Task | Reason | Files / Components | Depends | Validation |
|---|---|---|---|---|---|
| 1 | Fix CORS allow-list | P0-C01 credentialed origin abuse | `apps/api/src/app.ts:52`, `.env.example` (`CORS_ORIGINS`) | — | `curl -H Origin:https://evil.example` → no `Access-Control-Allow-Origin` |
| 2 | Add helmet + HSTS/CSP | P0-C02 clickjacking/downgrade | `apps/api/src/app.ts`, `apps/web/next.config.js`, `apps/api/src/infrastructure/metrics/metrics.route.ts` | 1 | `curl -I /api/v1/health` shows `Strict-Transport-Security`, `X-Frame-Options` |
| 3 | Fix compose port conflict | P0-C03 bootstrap breaks | `docker-compose.yml:9`, `README.md`, `docs/DEPLOYMENT.md`, `package.json:db:migrate` | — | `docker compose up -d` succeeds with host PG 5432 running |
| 4 | Generate final report at tag | P0-C05 stale gate | `docs/FINAL_IMPLEMENTATION_REPORT.md`, `.agent/planning/PROJECT_STATE.md` | — | `git tag v0.1.0-mvp` points to commit in report header |
| 5 | Real-model eval smoke (gated CI) | P0-C04 false confidence | `tests/evals/*`, `packages/processing/src/local-*provider.ts`, CI job `eval:real` | — | CI artifact `rag-eval-real.json` with `Recall@5`/`citation` on `bge-m3` |
| 6 | Add HNSW index migration | P1-H06 search P95 | `infra/migrations/*_add-hnsw-index.js` | 3 | `EXPLAIN` shows `hnsw`, load test P95 <1.5s |
| 7 | IP-aware rate limit | P1-H03 brute force | `apps/api/src/app.ts:56`, `common/auth/authorize.ts` | 1 | `k6` auth flood → 429 per IP, not global |
| 8 | Malware scan toggle doc | P1-H02 operational fallback | `documents.service.ts`, `.env.example: MALWARE_SCAN`, `docs/SECURITY.md` | — | `grep -r MALWARE_SCAN docs` |
| 9 | Refresh replay test | P1-H04 auth hardening | `auth.route.test.ts`, `refresh-token.repository.ts` | — | Test reuse → 401 + lockout |
| 10 | Publish OpenAPI 3.1 | P1-H09 contract source | `docs/api/openapi.yaml`, contract tests | — | `pnpm build:openapi && pnpm test:contract` |

---

## Recommended Next 10 Tasks (highest value after review)

1. **Fix P0-C01 + P0-C02** (security headers) — unblocks prod gate; 1–2h.
2. **Fix P0-C03** (compose port) — unblocks onboarding; 30m.
3. **Add HNSW migration + benchmark** (P1-H06) — prevents silent scaling cliff.
4. **Wire `trustProxy` + IP rate limiting** (P1-H03) — auth abuse surface.
5. **Real-model smoke job** (P0-C04) — de-risk pilot recall.
6. **OpenAPI generation** (P1-H09) — enable SDK generation for `docs/BACKLOG.md` connectors.
7. **Facets as aggregates** (P1-H05) — admin analytics correctness at >1k docs.
8. **Storage size gate pre-sign** (S06) — quota DOS hardening.
9. **Playwright E2E (3 flows)** — login→upload→publish, student search→detail, RAG ask→cite.
10. **Design-token pass** (typography/spacing/radius) — make product feel institutional, not AI-template.

---

## Appendix — Audit Method

- Read all 21 contract specs (conflict hierarchy per `AGENTS.md` §4: ADR > security/tenant-isolation > conservative).
- Inspected repo tree (`apps/api`, `apps/web`, `apps/worker`, `packages/*`, `infra/migrations`, `tests/*`, `docs/*`, `.agent/*`, `docker-compose.*`, `.env.example`, `vitest.config.ts`).
- Git: `main` clean, no untracked, `60cefa6` + 79 PRs merged via task branches (`feat/Px-yyy`), no suspicious large commits, no direct `main` commits.
- Ran full test suite on pgvector 5434 (78/582 PASS).
- Sampled core journeys via `vitest` integration (not live browser) + code paths for search/AI/tenant/lifecycle/storage.

*Evidence before synthesis. Files cited as `path:line`.*
