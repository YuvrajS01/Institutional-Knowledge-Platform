# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 1 (Identity and Multi-Tenancy) — in progress.

## Current Task

**P1-004** (Implement authentication) — implementation complete on task branch `feat/P1-004-authentication`; PR pending human approval.

## Current Branch

`feat/P1-004-authentication`

## Overall Status

`PHASE_1_IN_PROGRESS` — schema + authentication done; RBAC/tenant helpers/cross-tenant tests/admin UI pending.

## Last Completed Task

P1-004 (Implement authentication) — login/refresh/logout/me with JWT access tokens + rotated refresh tokens, verified live.

## What Is Working

- Everything from Phase 0 + P1-001/002/003 (merged into `main` via PRs #1–#4).
- Authentication (this PR):
  - `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh` (rotation), `POST /api/v1/auth/logout` (revoke), `GET /api/v1/auth/me` (user + memberships).
  - Access tokens: JWT (HS256, jose), default 15 min TTL; refresh tokens: opaque, sha-256 hashed at rest, 30 day TTL, rotated on every refresh.
  - `bcryptjs` password hashing; case-insensitive email lookup; inactive users cannot log in; login errors never reveal whether an account exists.
  - Auth rate limit: 10 requests/min per route (429 envelope via `RATE_LIMITED`).
  - `refresh_tokens` + `users.password_hash` migrations.
  - `DATABASE_URL_TEST`-isolated integration test database (auto-created + migrated by vitest global setup).
  - Identity seed script (`pnpm db:seed`): 1 institution, 3 departments, 5 role users (password `Password123!`, dev only).
- CI: `checks` job now runs the whole test suite against a Postgres service container.

## What Is Not Implemented

- Phase 1 remainder: RBAC (P1-005), tenant-aware repository helpers (P1-006), cross-tenant security tests (P1-007), institution/department admin UI (P1-008).
- Password reset/email verification (no email adapter yet; deferred).
- MFA for administrators (security checklist item; deferred with docs note).
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

`main` contains merged Phase 0 + P1-001..P1-003. Task branch `feat/P1-004-authentication` adds authentication, all checks green:

```text
lint ✅  typecheck ✅ (incl. tests)  tests ✅ (36, incl. DB integration)  build ✅ (5/5)  format ✅  migrations ✅  seed ✅  live login/me ✅
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
| Unit/integration tests | PASS (36) |
| Migrations against Postgres (up/down/up) | PASS |
| Health/readiness live checks | PASS (API + worker) |
| Authentication live flow (login → me) | PASS |
| E2E tests | NOT STARTED (Phase 9) |
| Security verification | NOT STARTED |
| Search evaluation | NOT STARTED |
| AI/RAG evaluation | NOT STARTED |

## Next Recommended Action

After P1-004 merges, start **P1-005** (Implement RBAC) from updated `main` on branch `feat/P1-005-rbac`.

## Last Updated

2026-08-13
