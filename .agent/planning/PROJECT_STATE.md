# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 2 (Document Core) — in progress.

## Current Task

**P2-002** (Add object storage abstraction) — implementation complete on task branch `feat/P2-002-object-storage`; PR pending human approval.

## Current Branch

`feat/P2-002-object-storage`

## Overall Status

`PHASE_2_IN_PROGRESS` — schema + storage abstraction done; signed upload, CRUD service, lifecycle, audit, admin UI pending.

## Last Completed Task

P2-002 (Add object storage abstraction) — S3-compatible adapter verified against real MinIO.

## What Is Working

- Everything from Phases 0–1 + P2-001 (merged into `main` via PRs #1–#10).
- Object storage layer (this PR, per `.agent/architecture/TECHNICAL_SPEC.md` §16 and the security checklist):
  - `ObjectStorage` interface: `put`/`get`/`head`/`delete`/`presignPut`/`presignGet`; typed `StorageError` (NOT_FOUND/UNAVAILABLE); missing keys return null.
  - `createS3ObjectStorage` via `@aws-sdk/client-s3` + `s3-request-presigner` (path-style, MinIO/R2-compatible; credentials/endpoint from env).
  - `ensureStorageBucket` (idempotent, used by tests).
  - `storage-keys.ts` — server-side key derivation per spec (`{inst}/documents/{doc}/v{ver}/original.{ext}`, `extracted.txt`, `ocr.json`, `preview/page-001.png`).
  - CI `checks` job now runs a MinIO service so the adapter is integration-tested in CI.

## What Is Not Implemented

- Phase 2 remainder: signed upload flow (P2-003), document CRUD service (P2-004), lifecycle state machine (P2-005), audit logging (P2-006), admin document list UI (P2-007), upload/review UI (P2-008).
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

`main` contains merged Phases 0–1 + P2-001. Task branch `feat/P2-002-object-storage` adds the storage layer, all checks green:

```text
lint ✅  typecheck ✅ (incl. tests)  tests ✅ (93, incl. MinIO integration)  build ✅ (5/5)  format ✅
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
| Unit/integration tests | PASS (93) |
| Migrations against Postgres (up/down/up) | PASS |
| Health/readiness live checks | PASS (API + worker) |
| Authentication live flow (login → me) | PASS |
| RBAC guard (roles, tenant scope, cross-tenant) | PASS |
| Tenant repository isolation (cross-tenant) | PASS |
| Cross-tenant security matrix (4 actors × 14 capabilities × 2 tenants) | PASS |
| Admin API + web admin flow (live) | PASS |
| Object storage (MinIO: put/get/head/presign/delete) | PASS |
| E2E tests | NOT STARTED (Phase 9) |
| Security verification | NOT STARTED |
| Search evaluation | NOT STARTED |
| AI/RAG evaluation | NOT STARTED |

## Next Recommended Action

After P2-002 merges, start **P2-003** (Implement signed upload flow) from updated `main` on branch `feat/P2-003-signed-upload`.

## Last Updated

2026-08-13
