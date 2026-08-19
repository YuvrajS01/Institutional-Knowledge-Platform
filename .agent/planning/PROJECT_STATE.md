# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 2 (Document Core) — in progress.

## Current Task

**P2-007** (Build admin document list) — implementation complete on task branch `feat/P2-007-admin-document-list`; PR pending human approval.

## Current Branch

`feat/P2-007-admin-document-list`

## Overall Status

`PHASE_2_IN_PROGRESS` — schema, storage, upload, CRUD, lifecycle, audit, admin document list done; upload/review UI pending.

## Last Completed Task

P2-007 (Build admin document list) — admin documents page with filters, pagination, and lifecycle actions.

## What Is Working

- Everything from Phases 0–1 + P2-001..P2-006 (merged into `main` via PRs #1–#15).
- Admin document list UI (this PR, per `.agent/design/UI_UX_DESIGN.md` §15/§18):
  - `/admin` restructured with a shared nav layout (Overview, Documents) + sign out.
  - `/admin/documents`: searchable, status-filtered, paginated table (Title/Type/Department/Status/Published) with status badges.
  - Lifecycle actions in the UI: Submit (draft) → Approve (in review, `document.approve`) → Publish (approved, `document.publish`) → Archive (published); buttons gated by `ROLE_CAPABILITIES`.
  - `lib/api` gained `apiEnvelopeRequest` (data + meta) for paginated endpoints.

## What Is Not Implemented

- Phase 2 remainder: upload/review UI (P2-008).
- Document detail page, summary, dates, bookmarks (Phase 6).
- Audit-log UI (backlogged).
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

`main` contains merged Phases 0–1 + P2-001..P2-006. Task branch `feat/P2-007-admin-document-list` adds the admin documents UI, all checks green:

```text
lint ✅  typecheck ✅ (incl. tests)  tests ✅ (132)  build ✅ (6/6 incl. web)  format ✅  live admin flow ✅ (list → submit → approve → publish)
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
| E2E tests | NOT STARTED (Phase 9) |
| Security verification | NOT STARTED |
| Search evaluation | NOT STARTED |
| AI/RAG evaluation | NOT STARTED |

## Next Recommended Action

After P2-007 merges, start **P2-008** (Build upload/review UI shell) from updated `main` on branch `feat/P2-008-upload-review-ui` — closes Phase 2.

## Last Updated

2026-08-13
