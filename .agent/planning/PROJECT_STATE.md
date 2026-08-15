# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 1 (Identity and Multi-Tenancy) — complete on task branch `feat/P1-008-admin-ui`; awaiting PR approval and merge.

## Current Task

**P1-008** (Build institution/department admin UI) — implementation complete on task branch `feat/P1-008-admin-ui`; PR pending human approval.

## Current Branch

`feat/P1-008-admin-ui`

## Overall Status

`PHASE_1_COMPLETE` — identity, multi-tenancy, auth, RBAC, tenant repositories, security suite, and admin UI all delivered. Next: Phase 2 (Documents).

## Last Completed Task

P1-008 (Build institution/department admin UI) — closes out Phase 1.

## What Is Working

- Everything from Phase 0 + P1-001..P1-007 (merged into `main` via PRs #1–#8).
- Admin API (this PR, per `.agent/api/API_SPEC_SHEET.md` §4–§5):
  - `GET/PATCH /api/v1/institutions/current` (read: any member; patch: `institutions.manage`)
  - `GET /api/v1/departments` (paginated, search/status filters, any member) · `GET /api/v1/departments/:id`
  - `POST /api/v1/departments` (201, 409 on duplicate code) · `PATCH /api/v1/departments/:id` · `DELETE /api/v1/departments/:id` (soft deactivate → 204) — all `departments.manage`
  - Rate limits: reads 300/min, writes 60/min per route.
  - `createAuthorization` now exposes `guard(capability)` + `requireMember`.
- Admin web UI (this PR):
  - `/login` — email/password, stores session (tokens + institution) in localStorage, redirects to `/admin`.
  - `/admin` — institution settings (name/timezone, admin only) and departments table with add/deactivate (admin only); loading/error/empty states; manage controls hidden for non-admins via `ROLE_CAPABILITIES`.
  - `lib/api.ts` envelope client + `lib/auth.ts` session helpers; `@ikp/shared` consumed by the web app.

## What Is Not Implemented

- Phases 2–10: documents, processing, publishing, search, consumption, notifications, AI, hardening, production readiness.
- TanStack Query deferred until the search UI (P5-010) where it adds more value; refresh-token rotation is not yet wired in the web client.

## Active Blockers

- P1-008 PR requires human approval to merge into `main` (repository merge policy).

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

`main` contains merged Phase 0 + P1-001..P1-007. Task branch `feat/P1-008-admin-ui` completes Phase 1, all checks green:

```text
lint ✅  typecheck ✅ (incl. tests)  tests ✅ (83)  build ✅ (6/6 incl. web)  format ✅  live admin flow ✅ (login → list → create → student denied 403)
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
| Unit/integration tests | PASS (83) |
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

After P1-008 merges, start **Phase 2 — Documents**: **P2-001** (Create document/document-version schema) from updated `main` on branch `feat/P2-001-document-schema`.

## Last Updated

2026-08-13
