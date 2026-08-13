# Agent Task Contract

Use this contract for each task selected from `TASK_MANIFEST.md`.

## Required task record

```yaml
task_id: P0-001
title: Initialize repository structure
priority: P0
status: TODO
depends_on: []
spec_refs:
  - PRD.md
  - TECHNICAL_SPEC.md
acceptance_criteria:
  - Repository structure exists
  - All applications boot
verification:
  - pnpm lint
  - pnpm typecheck
  - pnpm test
artifacts:
  - source files
  - tests
  - documentation
```

## Agent behavior

Before implementation:

- Verify dependencies are complete.
- Verify specification references.
- Identify affected services.

After implementation:

- Replace `TODO` with `DONE` only after verification.
- Add notes for any deviations.
- Update ADRs for architectural decisions.

## Blocked tasks

A task is `BLOCKED` only when:
- An explicit prerequisite is missing.
- A required external credential/service cannot be substituted for local development.
- The specification has an unresolved contradiction.

When blocked:
- State the blocking dependency in the manifest.
- Complete other unblocked tasks.
- Do not fabricate external behavior.

## Completion evidence

A task completion note should include:

```text
Implemented:
- ...

Verified:
- ...

Tests:
- ...

Docs updated:
- ...

Known limitations:
- ...
```


## Git Requirements

Each meaningful task should have:

```text
Task ID
  ↓
Task branch
  ↓
Atomic commit(s)
  ↓
Pull request
  ↓
CI/review
  ↓
Merge into main
```

Recommended branch:

```text
feat/<TASK-ID>-<short-name>
```

Recommended commit:

```text
feat(<scope>): <summary> [TASK-ID]
```

Do not mark a task `DONE` until the implementation is verified and the Git/PR requirements applicable to the repository have been satisfied.

## Project State Handoff

When work may be continued by another AI model/tool, update:

`.agent/planning/PROJECT_STATE.md`

Record the current task, branch, implementation status, verification status, blockers, and next steps. Keep the state concise; do not duplicate the task manifest or Git history.
