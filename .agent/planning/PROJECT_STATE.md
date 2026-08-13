# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 1 (Identity and Multi-Tenancy) — in progress.

## Current Task

**P1-001** (Create institutions migration) — implementation complete on task branch `feat/P1-001-institutions-migration`; PR pending human approval.

## Current Branch

`feat/P1-001-institutions-migration`

## Overall Status

`PHASE_1_IN_PROGRESS` — institutions schema done; users/memberships/departments/auth/RBAC/tenant helpers pending.

## Last Completed Task

P1-001 (Create institutions migration) — applied and verified against local PostgreSQL.

## What Is Working

- Everything from Phase 0 (merged into `main` via PR #1): pnpm monorepo, strict TS, ESLint/Prettier/Vitest, env validation, Docker Compose (pgvector/Redis/MinIO), CI, Fastify API shell, Next.js web shell, worker shell, health/readiness endpoints, `node-pg-migrate` framework.
- `institutions` table (per `.agent/architecture/TECHNICAL_SPEC.md` §5):
  - UUID PK (`gen_random_uuid()`), unique `slug`, `name`, `logo_url`, `status` enum (`ACTIVE`/`INACTIVE`/`SUSPENDED`), `timezone` (default `UTC`), `settings` JSONB, UTC `created_at`/`updated_at`.
  - Index on `status`; unique constraint on `slug`.
  - Up/down migrations verified (`db:migrate` → insert/select → `db:migrate:down` drops → re-up).

## What Is Not Implemented

- Phase 1 remainder: users, memberships, departments migrations (P1-002, P1-003), authentication (P1-004), RBAC (P1-005), tenant-aware repository helpers (P1-006), cross-tenant security tests (P1-007), institution/department admin UI (P1-008).
- Phases 2–10 (documents, processing, publishing, search, consumption, notifications, AI, hardening, production readiness).

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

`main` contains the merged Phase 0 foundation. Task branch `feat/P1-001-institutions-migration` adds the institutions migration (1 atomic commit + docs), all checks green:

```text
install ✅  lint ✅  typecheck ✅ (7/7)  tests ✅ (15)  build ✅ (5/5)  format ✅  migrations ✅ (up/down/up)
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
| Unit/integration tests | PASS (15) |
| Migrations against Postgres (up/down/up) | PASS |
| Health/readiness live checks | PASS (API + worker) |
| E2E tests | NOT STARTED (Phase 9) |
| Security verification | NOT STARTED |
| Search evaluation | NOT STARTED |
| AI/RAG evaluation | NOT STARTED |

## Next Recommended Action

After P1-001 merges, start **P1-002** (Create users/memberships migration) from updated `main` on branch `feat/P1-002-users-memberships-migration`.

## Last Updated

2026-08-13
