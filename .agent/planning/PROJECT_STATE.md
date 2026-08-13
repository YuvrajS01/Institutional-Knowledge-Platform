# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Phase 0 (Foundation) — complete on task branch `feat/P0-001-repository-foundation`; awaiting PR approval and merge.

## Current Task

Next unblocked: **P1-001** (Create institutions migration) — depends on P0-005 (DONE) and the merged Phase 0 branch.

## Current Branch

`feat/P0-001-repository-foundation` (Phase 0 foundation: P0-001 through P0-008)

## Overall Status

`PHASE_0_FOUNDATION_COMPLETE` — verification green; PR pending human approval before merging to `main`.

## Last Completed Task

P0-008 (health/readiness endpoints), closing out Phase 0.

## What Is Working

- pnpm 10 monorepo with `apps/api`, `apps/web`, `apps/worker`, `packages/config`, `packages/shared`.
- Strict TypeScript base config (`tsconfig.base.json`), ESLint flat config, Prettier, Vitest.
- Zod-based environment validation in `@ikp/config` with per-service schemas and fail-fast boot.
- Docker Compose: PostgreSQL+pgvector, Redis, MinIO (with bucket init) + healthchecks.
- GitHub Actions CI: lint, build, typecheck, tests, migration-framework check against a real Postgres service.
- Fastify API shell with error envelope (per API spec), request IDs, graceful shutdown.
- Worker shell with health server.
- Next.js web shell.
- `node-pg-migrate` migration framework (`infra/migrations/`, `pnpm db:migrate`).
- Health/readiness endpoints verified end-to-end against live Postgres + Redis (`/ready` reports `database: up, redis: up`).

## What Is Not Implemented

- Phase 1+ (identity, multi-tenancy, documents, processing, search, AI, notifications, deployment).
- No database schema beyond the migration framework (`pgmigrations` table only).
- No authentication, RBAC, or tenant isolation yet.
- No object-storage integration beyond the MinIO container.

## Active Blockers

- Phase 0 PR requires human approval to merge into `main` (repository merge policy).
- Phase 1 work should start from merged `main` after the Phase 0 PR is approved.

## Important Decisions

- **Working product title:** Institutional Knowledge Platform.
- Final commercial branding is intentionally deferred until MVP validation.
- Technical identifiers remain product-name agnostic (`@ikp/*` package scope).
- Stack: pnpm workspace; Fastify (API); Next.js (web); Vitest; ESLint flat config; Prettier; node-pg-migrate; PostgreSQL/pgvector; Redis; MinIO (S3-compatible).
- API and worker use distinct port variables (`API_PORT`, `WORKER_PORT`) because they share the repo `.env`.
- AI providers remain replaceable through adapters/interfaces.
- Git uses task branches and pull requests; merging into `main` requires the repository's approval policy.

## Current Git State

Task branch `feat/P0-001-repository-foundation` contains the complete Phase 0 foundation (8 atomic commits, one per task ID), all checks green:

```text
install ✅  lint ✅  typecheck ✅  tests ✅ (15)  build ✅  format ✅  migrations ✅
```

`main` is unchanged (still at the initial documentation commit).

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
| Migrations against Postgres | PASS |
| Health/readiness live checks | PASS (API + worker) |
| E2E tests | NOT STARTED (Phase 9) |
| Security verification | NOT STARTED |
| Search evaluation | NOT STARTED |
| AI/RAG evaluation | NOT STARTED |

## Next Recommended Action

1. Get the Phase 0 PR reviewed and merged into `main`.
2. Start **P1-001** (Create institutions migration) from updated `main` on branch `feat/P1-001-institutions-migration`.

## Last Updated

2026-08-13
