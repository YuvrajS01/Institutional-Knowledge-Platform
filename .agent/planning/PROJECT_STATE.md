# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 2 (Document Core) — in progress.

## Current Phase

Phase 3 (Document Processing) — in progress.

## Current Task

**P3-002** (Implement PDF text extraction adapter) — implementation complete on task branch `feat/P3-002-pdf-extraction`; PR pending human approval.

## Current Branch

`feat/P3-002-pdf-extraction`

## Overall Status

`PHASE_3_IN_PROGRESS` — queue + text extraction done; OCR, orchestration, metadata/date extraction, chunking pending.

## Last Completed Task

P3-002 (Implement PDF text extraction adapter) — verified against real generated PDFs.

## What Is Working

- Everything from Phases 0–2 + P3-001 (merged into `main` via PRs #1–#18).
- Text extraction (this PR, per `.agent/architecture/TECHNICAL_SPEC.md` §7, ADR-003/007):
  - New `@ikp/processing` package: `TextExtractor` interface + `PdfTextExtractor` (unpdf/pdf.js — pure JS, local-first, no native deps).
  - Handles `application/pdf` (per-page text + page count), `text/plain` (direct), other types → `method: 'none'` (signals OCR need).
  - `isTextAdequate` heuristic (min chars/page) — the native-vs-OCR decision input used by orchestration (P3-004).

## What Is Not Implemented

- Phase 3 remainder: OCR adapter (P3-003), processing orchestration (P3-004), metadata extraction interface (P3-005), providers (P3-006/007), chunking (P3-008), retry/status UI (P3-009), scanned-PDF tests (P3-010).
- Uploads still report `QUEUED`; no consumer processes them yet.
- Phases 4–10.

## Active Blockers

- P1-001 PR requires human approval to merge into `main` (repository merge policy).

## Important Decisions

- **Working product title:** Institutional Knowledge Platform.
- Final commercial branding is intentionally deferred until MVP validation.
- Technical identifiers remain product-name agnostic (`@ikp/*` package scope).
- Stack: pnpm workspace; Fastify (API); Next.js (web); Vitest; ESLint flat config; Prettier; node-pg-migrate; PostgreSQL/pgvector; Redis; MinIO (S3-compatible).
- API and worker use distinct port variables (`API_PORT`, `WORKER_PORT`) because they share the repo `.env`.
- Migrations are CommonJS `.js` files under `infra/migrations/`; ESLint flat config declares CJS globals for that directory.
- AI providers remain replaceable through adapters/interfaces.
- Git uses task branches and pull requests; merging into `main` requires the repository's approval policy.

## Current Git State

`main` contains merged Phases 0–2 + P3-001. Task branch `feat/P3-002-pdf-extraction` adds text extraction, all checks green:

```text
lint ✅  typecheck ✅ (incl. tests, 9/9)  tests ✅ (146, incl. real PDF extraction)  build ✅ (7/7)  format ✅
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
| Unit/integration tests | PASS (132) |
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
| E2E tests | NOT STARTED (Phase 9) |
| Security verification | NOT STARTED |
| Search evaluation | NOT STARTED |
| AI/RAG evaluation | NOT STARTED |

## Next Recommended Action

After P3-002 merges, start **P3-003** (Implement OCR adapter) from updated `main` on branch `feat/P3-003-ocr-adapter`.

## Last Updated

2026-08-13
