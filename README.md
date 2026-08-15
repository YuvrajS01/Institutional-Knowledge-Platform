# Institutional Knowledge Platform

A search-first institutional document and knowledge platform for organizations such as colleges and universities.

> **Working title:** Institutional Knowledge Platform
> The commercial product name is intentionally deferred until MVP validation.

## Repository Structure

```text
.
├── .agent/          # Product, design, architecture, AI, API and agent specifications
├── apps/
│   ├── api/         # Fastify REST API (`@ikp/api`)
│   ├── web/         # Next.js web application (`@ikp/web`)
│   └── worker/      # Background worker process (`@ikp/worker`)
├── packages/
│   ├── config/      # Environment validation (Zod) (`@ikp/config`)
│   ├── shared/      # Shared domain types, enums, error envelope (`@ikp/shared`)
│   └── ui/          # (reserved) Shared UI components
├── infra/
│   ├── docker/      # Docker infrastructure
│   ├── migrations/  # Database migrations (node-pg-migrate)
│   └── scripts/     # Operational scripts
├── tests/           # Test suites (unit, integration, e2e, fixtures, evals)
├── public/          # Public assets
└── README.md
```

## Prerequisites

- Node.js >= 22
- pnpm 10 (`npm install -g pnpm@10`)
- Docker with Docker Compose (for local PostgreSQL/pgvector, Redis, MinIO)

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env

# 3. Start local infrastructure (PostgreSQL + pgvector, Redis, MinIO)
docker compose up -d

# 4. Run database migrations
pnpm db:migrate

# 5. (optional) Seed identity data — 1 institution, 3 departments,
#    5 users (admin/approver/deptadmin/faculty/student), password: Password123!
pnpm db:seed

# 6. Start all applications in watch mode
pnpm dev
```

Applications:

| Service         | URL                   | Port |
| --------------- | --------------------- | ---- |
| Web application | http://localhost:3000 | 3000 |
| API             | http://localhost:4000 | 4000 |
| Worker health   | http://localhost:4100 | 4100 |
| MinIO console   | http://localhost:9001 | 9001 |

## Development Commands

| Command                                    | Purpose                               |
| ------------------------------------------ | ------------------------------------- |
| `pnpm dev`                                 | Start all applications in watch mode  |
| `pnpm build`                               | Production build of all packages      |
| `pnpm typecheck`                           | Type check all packages (strict mode) |
| `pnpm lint`                                | ESLint across the repository          |
| `pnpm format` / `pnpm format:check`        | Prettier write / check                |
| `pnpm test`                                | Vitest unit + integration tests       |
| `pnpm db:migrate` / `pnpm db:migrate:down` | Run / roll back migrations |
| `pnpm db:seed` | Seed development identity data (idempotent) |

## Environment

All services validate their environment at boot via `@ikp/config` (Zod schemas) and fail fast on missing or invalid configuration. See `.env.example` for the full variable list and `.agent/operations/ENVIRONMENT_MATRIX.md` for per-environment guidance. Never commit `.env`; production secrets come from the deployment environment.

The test suite runs against an isolated database. Without `DATABASE_URL_TEST`, it derives `institutional_knowledge_test` from `DATABASE_URL` and creates it automatically.

## Health and Readiness

- `GET /health` — liveness (always answers when the process is up).
- `GET /ready` — readiness (checks PostgreSQL and Redis connectivity; returns `503` when a dependency is down).

Responses follow the API error envelope from `.agent/api/API_SPEC_SHEET.md`.

## Agent Development

For autonomous coding agents:

```text
AGENTS.md
  ↓
INSTRUCTIONS.md
  ↓
.agent/AGENTS.md
  ↓
.agent/INSTRUCTIONS.md
  ↓
.agent/planning/PHASE_PLAN.md
  ↓
.agent/planning/TASK_MANIFEST.md
```

## Product Naming

The current product name is a working title. Keep technical identifiers, package names, APIs, infrastructure resources and storage keys brand-neutral so the commercial name can change after MVP validation.

## Switching AI Coding Models

The repository supports sequential model switching. When moving between tools such as OpenCode and Codex, use `.agent/planning/PROJECT_STATE.md` as the handoff snapshot and verify it against Git before continuing.
