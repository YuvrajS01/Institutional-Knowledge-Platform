# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 2 (Document Core) — in progress.

## Current Task

**P2-003** (Implement signed upload flow) — implementation complete on task branch `feat/P2-003-signed-upload`; PR pending human approval.

## Current Branch

`feat/P2-003-signed-upload`

## Overall Status

`PHASE_2_IN_PROGRESS` — schema, storage, and signed upload done; CRUD service, lifecycle, audit, admin UI pending.

## Last Completed Task

P2-003 (Implement signed upload flow) — `POST /documents` + `POST /documents/:id/upload-complete`, verified end-to-end.

## What Is Working

- Everything from Phases 0–1 + P2-001/P2-002 (merged into `main` via PRs #1–#11).
- Signed upload flow (this PR, per `.agent/api/API_SPEC_SHEET.md` §6):
  - `POST /api/v1/documents` (`document.create`): creates a DRAFT document + `document_metadata` (audience etc.), derives a spec-compliant storage key, returns a presigned PUT URL (15 min, content-type pinned).
  - `POST /api/v1/documents/:id/upload-complete` (`document.edit_draft`, creator-only): verifies the object exists (head), enforces size limit (settings `max_upload_mb`, default 25MB → 413), downloads to compute sha-256 (integrity + dedupe), registers version 1 with real mime/size/sha, sets `current_version_id`, returns `{ document_id, processing_status: 'QUEUED' }`. Idempotent replay → same response, no duplicate side effects.
  - MIME allowlist (pdf/png/jpeg/gif/webp/txt/doc/docx) → 415 otherwise; tenant isolation → 404 across tenants.
  - `document_metadata` table added (TECH_SPEC §5) to carry audience/tags/dates for the endpoint contract.
  - Slug derived from title with uniqueness handling (per-tenant).

## What Is Not Implemented

- Phase 2 remainder: document CRUD service (P2-004), lifecycle state machine (P2-005), audit logging (P2-006), admin document list UI (P2-007), upload/review UI (P2-008).
- Processing pipeline (Phase 3) — uploads report `QUEUED` but no worker consumes the queue yet.
- Phases 3–10.

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

`main` contains merged Phases 0–1 + P2-001..P2-002. Task branch `feat/P2-003-signed-upload` adds the upload flow, all checks green:

```text
lint ✅  typecheck ✅ (incl. tests)  tests ✅ (102, incl. upload round-trip vs MinIO)  build ✅ (5/5)  format ✅
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
| Unit/integration tests | PASS (102) |
| Migrations against Postgres (up/down/up) | PASS |
| Health/readiness live checks | PASS (API + worker) |
| Authentication live flow (login → me) | PASS |
| RBAC guard (roles, tenant scope, cross-tenant) | PASS |
| Tenant repository isolation (cross-tenant) | PASS |
| Cross-tenant security matrix (4 actors × 14 capabilities × 2 tenants) | PASS |
| Admin API + web admin flow (live) | PASS |
| Object storage (MinIO: put/get/head/presign/delete) | PASS |
| Signed upload flow (create → presigned PUT → confirm, sha256) | PASS |
| E2E tests | NOT STARTED (Phase 9) |
| Security verification | NOT STARTED |
| Search evaluation | NOT STARTED |
| AI/RAG evaluation | NOT STARTED |

## Next Recommended Action

After P2-003 merges, start **P2-004** (Implement document CRUD service) from updated `main` on branch `feat/P2-004-document-crud`.

## Last Updated

2026-08-13
