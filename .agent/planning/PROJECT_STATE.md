# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 2 (Document Core) — in progress.

## Current Task

**P2-001** (Create document/document-version schema) — implementation complete on task branch `feat/P2-001-document-schema`; PR pending human approval.

## Current Branch

`feat/P2-001-document-schema`

## Overall Status

`PHASE_2_IN_PROGRESS` — document schema done; storage abstraction, signed upload, CRUD service, lifecycle state machine, audit logs pending.

## Last Completed Task

P2-001 (Create document/document-version schema) — applied and verified against local PostgreSQL.

## What Is Working

- Everything from Phases 0–1 (merged into `main` via PRs #1–#9): monorepo tooling, identity/auth/RBAC, tenant repositories, security suite, admin UI.
- Document core schema (this PR, per `.agent/architecture/TECHNICAL_SPEC.md` §5):
  - `documents`: UUID PK, `institution_id` FK (CASCADE), `current_version_id` (circular FK → versions, SET NULL), `title`, `slug` (unique per institution), `document_type` enum (NOTICE/CIRCULAR/POLICY/FORM/SCHEDULE/REPORT/OTHER), `status` enum (DRAFT/IN_REVIEW/APPROVED/PUBLISHED/SUPERSEDED/ARCHIVED), `department_id` FK (SET NULL), `published_at`/`effective_from`/`effective_to`, `created_by` FK (RESTRICT), UTC timestamps.
  - `document_versions`: UUID PK, `document_id` FK (CASCADE), `version_number` (unique per document), `storage_key` (unique), `mime_type`, `size_bytes`, `sha256`, `extracted_text`, `ocr_status`, `page_count`, `created_by`, `created_at`.
  - Indexes on (institution, status), (institution, department), (institution, published_at), (institution, slug unique), status; versions (document, version) unique, storage_key unique.
  - `DOCUMENT_TYPES`/`DocumentType` added to `@ikp/shared`.

## What Is Not Implemented

- Phase 2 remainder: object storage (P2-002), signed upload (P2-003), document CRUD service (P2-004), lifecycle state machine (P2-005), audit logging (P2-006), admin document list UI (P2-007), upload/review UI (P2-008).
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

`main` contains merged Phases 0–1. Task branch `feat/P2-001-document-schema` starts Phase 2, all checks green:

```text
lint ✅  typecheck ✅ (incl. tests)  tests ✅ (84)  build ✅ (6/6)  format ✅  migrations ✅ (up/down/up, 6 constraint checks)
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
| Unit/integration tests | PASS (84) |
| Migrations against Postgres (up/down/up) | PASS |
| Health/readiness live checks | PASS (API + worker) |
| Authentication live flow (login → me) | PASS |
| RBAC guard (roles, tenant scope, cross-tenant) | PASS |
| Tenant repository isolation (cross-tenant) | PASS |
| Cross-tenant security matrix (4 actors × 14 capabilities × 2 tenants) | PASS |
| Admin API + web admin flow (live) | PASS |
| E2E tests | NOT STARTED (Phase 9) |
| Security verification | NOT STARTED |
| Search evaluation | NOT STARTED |
| AI/RAG evaluation | NOT STARTED |

## Next Recommended Action

After P2-001 merges, start **P2-002** (Add object storage abstraction) from updated `main` on branch `feat/P2-002-object-storage`.

## Last Updated

2026-08-13
