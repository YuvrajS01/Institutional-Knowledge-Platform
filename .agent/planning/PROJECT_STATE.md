# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 1 (Identity and Multi-Tenancy) — in progress.

## Current Task

**P1-006** (Implement tenant-aware repository helpers) — implementation complete on task branch `feat/P1-006-tenant-repository-helpers`; PR pending human approval.

## Current Branch

`feat/P1-006-tenant-repository-helpers`

## Overall Status

`PHASE_1_IN_PROGRESS` — schema, auth, RBAC, tenant repositories done; cross-tenant security suite and admin UI pending.

## Last Completed Task

P1-006 (Implement tenant-aware repository helpers) — `TenantRepository` base + reference `DepartmentsRepository` with cross-tenant regression tests.

## What Is Working

- Everything from Phase 0 + P1-001..P1-005 (merged into `main` via PRs #1–#6).
- Tenant-aware repository layer (this PR):
  - `TenantRepository` base class (`apps/api/src/infrastructure/db/tenant-repository.ts`): fail-fast `tenantId()` scope validation + `tenantCondition()` bound SQL fragment — tenant scope is explicit in every repository method (AGENTS.md §8).
  - `DepartmentsRepository` (reference tenant-owned consumer, feeds P1-008): `list` (search/status/pagination), `findById`, `findByCode`, `create` (409 on duplicate code within tenant), `setStatus` (soft deactivation, API spec §5).
  - `DEPARTMENT_STATUSES`/`DepartmentStatus` added to `@ikp/shared`.
  - Cross-tenant regression tests: other-tenant rows never returned by id/code/list; same code allowed across tenants, rejected within one; status updates never cross tenants.

## What Is Not Implemented

- Phase 1 remainder: cross-tenant security tests (P1-007), institution/department admin UI (P1-008).
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

`main` contains merged Phase 0 + P1-001..P1-005. Task branch `feat/P1-006-tenant-repository-helpers` adds the tenant repository layer, all checks green:

```text
lint ✅  typecheck ✅ (incl. tests)  tests ✅ (66, incl. cross-tenant regression)  build ✅ (5/5)  format ✅
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
| Unit/integration tests | PASS (66) |
| Migrations against Postgres (up/down/up) | PASS |
| Health/readiness live checks | PASS (API + worker) |
| Authentication live flow (login → me) | PASS |
| RBAC guard (roles, tenant scope, cross-tenant) | PASS |
| Tenant repository isolation (cross-tenant) | PASS |
| E2E tests | NOT STARTED (Phase 9) |
| Security verification | NOT STARTED |
| Search evaluation | NOT STARTED |
| AI/RAG evaluation | NOT STARTED |

## Next Recommended Action

After P1-006 merges, start **P1-007** (Add cross-tenant security tests) from updated `main` on branch `test/P1-007-cross-tenant-security`.

## Last Updated

2026-08-13
