# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 1 (Identity and Multi-Tenancy) — in progress.

## Current Task

**P1-007** (Add cross-tenant security tests) — implementation complete on task branch `test/P1-007-cross-tenant-security`; PR pending human approval.

## Current Branch

`test/P1-007-cross-tenant-security`

## Overall Status

`PHASE_1_IN_PROGRESS` — schema, auth, RBAC, tenant repositories, and the cross-tenant security suite done; admin UI pending.

## Last Completed Task

P1-007 (Add cross-tenant security tests) — dedicated `tests/integration/security/` suite proving tenant isolation and the full role×capability matrix.

## What Is Working

- Everything from Phase 0 + P1-001..P1-006 (merged into `main` via PRs #1–#7).
- Cross-tenant security suite (this PR):
  - `tests/integration/security/cross-tenant.test.ts`: 4 actors (student + admin in two tenants) × 14 capabilities × both tenants — every foreign-tenant request is 403 with `FORBIDDEN`; own-tenant access exactly matches `ROLE_CAPABILITIES`; denied responses leak no foreign-tenant identifiers.
  - `DbPool` structural interface — repositories/app depend on it instead of `pg.Pool`, enabling the suite (and future modules) to run from any directory.
  - `createTestPgPool()` + `seedInstitutionWithUsers()` helpers; vitest now includes `tests/**/*.test.ts`; `pnpm test:security` runs the suite alone.

## What Is Not Implemented

- Phase 1 remainder: institution/department admin UI (P1-008).
- Document-layer security tests (drafts/audience/signed URLs) arrive with Phases 2+; RAG boundaries in Phase 8 (P8-013).
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

`main` contains merged Phase 0 + P1-001..P1-006. Task branch `test/P1-007-cross-tenant-security` adds the cross-tenant security suite, all checks green:

```text
lint ✅  typecheck ✅ (incl. tests)  tests ✅ (69, incl. cross-tenant matrix)  build ✅ (5/5)  format ✅
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
| Unit/integration tests | PASS (69) |
| Migrations against Postgres (up/down/up) | PASS |
| Health/readiness live checks | PASS (API + worker) |
| Authentication live flow (login → me) | PASS |
| RBAC guard (roles, tenant scope, cross-tenant) | PASS |
| Tenant repository isolation (cross-tenant) | PASS |
| Cross-tenant security matrix (4 actors × 14 capabilities × 2 tenants) | PASS |
| E2E tests | NOT STARTED (Phase 9) |
| Security verification | NOT STARTED |
| Search evaluation | NOT STARTED |
| AI/RAG evaluation | NOT STARTED |

## Next Recommended Action

After P1-007 merges, start **P1-008** (Build institution/department admin UI) from updated `main` on branch `feat/P1-008-admin-ui` — completes Phase 1.

## Last Updated

2026-08-13
