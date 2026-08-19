# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 2 (Document Core) — in progress.

## Current Task

**P2-005** (Implement lifecycle state machine) — implementation complete on task branch `feat/P2-005-lifecycle`; PR pending human approval.

## Current Branch

`feat/P2-005-lifecycle`

## Overall Status

`PHASE_2_IN_PROGRESS` — schema, storage, upload, CRUD, lifecycle done; audit + admin/upload UI pending.

## Last Completed Task

P2-005 (Implement lifecycle state machine) — full DRAFT→IN_REVIEW→APPROVED→PUBLISHED→SUPERSEDED→ARCHIVED machine with per-transition authorization.

## What Is Working

- Everything from Phases 0–1 + P2-001..P2-004 (merged into `main` via PRs #1–#13).
- Lifecycle (this PR):
  - Pure transition model in `@ikp/shared` (`DOCUMENT_TRANSITIONS`, `canTransitionDocument`, labels) — DRAFT→[IN_REVIEW, ARCHIVED], IN_REVIEW→[APPROVED, DRAFT], APPROVED→[PUBLISHED, DRAFT], PUBLISHED→[SUPERSEDED, ARCHIVED], SUPERSEDED→[ARCHIVED], ARCHIVED terminal.
  - `POST /documents/:id/{submit-review|approve|publish|archive}` — per-transition capability + creator rules; invalid transitions → 409; submitting a contentless draft → 409; `published_at` set on publish; ARCHIVED is terminal.
  - Supersede transition (PUBLISHED→SUPERSEDED) exists in the machine; its dedicated endpoint arrives with P4-003.

## What Is Not Implemented

- Phase 2 remainder: audit logging (P2-006), admin document list UI (P2-007), upload/review UI (P2-008).
- Supersede endpoint + version history (Phase 4); approval queue UI (P4-004).
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

`main` contains merged Phases 0–1 + P2-001..P2-004. Task branch `feat/P2-005-lifecycle` adds the state machine, all checks green:

```text
lint ✅  typecheck ✅ (incl. tests)  tests ✅ (127, incl. full lifecycle walk)  build ✅ (5/5)  format ✅
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
| Unit/integration tests | PASS (127) |
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
| E2E tests | NOT STARTED (Phase 9) |
| Security verification | NOT STARTED |
| Search evaluation | NOT STARTED |
| AI/RAG evaluation | NOT STARTED |

## Next Recommended Action

After P2-005 merges, start **P2-006** (Implement audit logging) from updated `main` on branch `feat/P2-006-audit-logging`.

## Last Updated

2026-08-13
