# Institutional Knowledge Platform

A search-first institutional document and knowledge platform for organizations such as colleges and universities.

> **Working title:** Institutional Knowledge Platform  
> The commercial product name is intentionally deferred until MVP validation.

## Repository Structure

```text
.
├── .agent/          # Product, design, architecture, AI, API and agent specifications
├── apps/            # Application code
├── packages/        # Shared libraries/components
├── tests/            # Test suites
├── infra/            # Infrastructure and deployment
├── public/           # Public assets
├── AGENTS.md         # Agent bootstrap
├── INSTRUCTIONS.md   # Agent bootstrap
└── README.md
```

## Start Here

For an autonomous coding agent:

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
