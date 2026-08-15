# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 1 (Identity and Multi-Tenancy) — in progress.

## Current Task

**P1-005** (Implement RBAC) — implementation complete on task branch `feat/P1-005-rbac`; PR pending human approval.

## Current Branch

`feat/P1-005-rbac`

## Overall Status

`PHASE_1_IN_PROGRESS` — schema, authentication, and RBAC done; tenant repository helpers, cross-tenant tests, and admin UI pending.

## Last Completed Task

P1-005 (Implement RBAC) — capability model + tenant-scoped authorization guard, fully tested.

## What Is Working

- Everything from Phase 0 + P1-001..P1-004 (merged into `main` via PRs #1–#5).
- RBAC (this PR):
  - Capability model in `@ikp/shared` (`CAPABILITIES`, `ROLE_CAPABILITIES`, `hasCapability`) derived from the API authorization matrix; "optional" matrix cells default to deny.
  - `createAuthorization({ jwtSecret, pool })` → `guard(capability)` returns Fastify preHandler chain (authenticate + authorize).
  - Tenant scope from `X-Institution-Id` header — never trusted directly; resolved against memberships before any capability check (AGENTS.md §8 pattern).
  - `request.institution = { id, role, departmentId }` for downstream code.
  - `MembershipsRepository` extracted (shared by `/auth/me` and the guard); `AppError.forbidden()`.
  - Cross-institution requests → 403; missing/malformed header → 400; unauthenticated → 401.
- API spec sheet documents the `X-Institution-Id` convention.

## What Is Not Implemented

- Phase 1 remainder: tenant-aware repository helpers (P1-006), cross-tenant security tests (P1-007), institution/department admin UI (P1-008).
- Password reset/email verification; MFA for administrators (deferred, noted).
- Phases 2–10.

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

`main` contains merged Phase 0 + P1-001..P1-004. Task branch `feat/P1-005-rbac` adds RBAC, all checks green:

```text
lint ✅  typecheck ✅ (incl. tests)  tests ✅ (53, incl. RBAC integration)  build ✅ (5/5)  format ✅
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
| Unit/integration tests | PASS (53) |
| Migrations against Postgres (up/down/up) | PASS |
| Health/readiness live checks | PASS (API + worker) |
| Authentication live flow (login → me) | PASS |
| RBAC guard (roles, tenant scope, cross-tenant) | PASS |
| E2E tests | NOT STARTED (Phase 9) |
| Security verification | NOT STARTED |
| Search evaluation | NOT STARTED |
| AI/RAG evaluation | NOT STARTED |

## Next Recommended Action

After P1-005 merges, start **P1-006** (Implement tenant-aware repository helpers) from updated `main` on branch `feat/P1-006-tenant-repository-helpers`.

## Last Updated

2026-08-13
