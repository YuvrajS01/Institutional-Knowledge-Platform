# Project State

> This file is the persistent handoff snapshot for switching between AI coding models/tools such as OpenCode, Codex, Claude Code, or other agents.
>
> **Source-of-truth rule:** Git, the actual codebase, tests, and merged task history are authoritative. This file is a concise current-state snapshot and must be corrected if it becomes stale.

## Current Phase

Not started.

## Current Task

None yet.

## Current Branch

`main`

## Overall Status

`READY_TO_START`

## Last Completed Task

None.

## What Is Working

The repository currently contains the product specification and autonomous engineering documentation. Application implementation has not yet begun.

## What Is Not Implemented

- Application frontend
- API/backend
- Worker/document-processing pipeline
- Database schema/migrations
- Authentication implementation
- Document upload
- OCR
- Search
- RAG/institutional AI
- Notifications
- Production deployment

## Active Blockers

None.

## Important Decisions

- **Working product title:** Institutional Knowledge Platform.
- Final commercial branding is intentionally deferred until MVP validation.
- Technical identifiers should remain product-name agnostic.
- The MVP should favor a modular architecture over premature microservices.
- AI providers should be replaceable through adapters/interfaces.
- Institutional AI must use permission-aware retrieval and authoritative document citations.
- Git uses task branches and pull requests rather than direct development on `main`.
- Agents may create branches, implement, test, commit, push, and open PRs; merging into `main` requires the repository's approval policy.

## Current Git State

The initial documentation/repository setup should be committed before implementation begins.

Expected first implementation flow:

```text
main
  ↓
select first unblocked task
  ↓
feat/<TASK-ID>-<short-name>
  ↓
implement
  ↓
test
  ↓
commit
  ↓
push
  ↓
pull request
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
| Repository structure | READY |
| Documentation | READY |
| Git workflow | READY |
| Application build | NOT STARTED |
| Unit tests | NOT STARTED |
| Integration tests | NOT STARTED |
| E2E tests | NOT STARTED |
| Security verification | NOT STARTED |
| Search evaluation | NOT STARTED |
| AI/RAG evaluation | NOT STARTED |

## Next Recommended Action

Start the highest-priority unblocked task in `.agent/planning/TASK_MANIFEST.md`.

## Last Updated

2026-08-13
