# Autonomous Development Workflow

## Operating Mode

The agent works in small, verifiable increments.

### Cycle

1. Select task.
2. Read specifications.
3. Inspect repository.
4. Inspect existing implementation.
5. Identify dependencies.
6. Implement.
7. Test locally.
8. Run targeted checks.
9. Run relevant broader checks.
10. Update docs.
11. Mark task complete.
12. Select next unblocked task.

---

## Task Selection

Choose the highest-priority task where:

- All prerequisites are complete.
- The task is not blocked.
- The task belongs to the active phase.
- It provides meaningful product progress.

Do not select a downstream UI task when its backend contract does not exist unless a mock/stub is explicitly part of the plan.

---

## Change Sizing

Prefer increments that can be verified independently.

Examples:

Good:
- Add document database schema and repository.
- Add upload presign endpoint.
- Add processing job state machine.
- Add OCR worker.
- Add hybrid search endpoint.

Avoid:
- "Build the entire document system."

---

## Repository Inspection

Before coding:

- List repository structure.
- Read relevant source files.
- Inspect package/dependency versions.
- Inspect migrations.
- Search for existing patterns.
- Reuse existing abstractions where appropriate.

Do not create duplicate infrastructure because you failed to find existing code.

---

## Implementation Order

When a feature spans layers:

```text
Schema
 ↓
Repository
 ↓
Service
 ↓
API
 ↓
Shared types/client
 ↓
Frontend
 ↓
E2E test
 ↓
Documentation
```

AI features:

```text
Provider interface
 ↓
Provider adapter
 ↓
Unit tests
 ↓
Pipeline/service
 ↓
Retrieval/search
 ↓
RAG
 ↓
Evaluation
 ↓
UI
```

---

## Verification

At the end of every meaningful increment run:

1. Targeted unit tests.
2. Targeted integration tests.
3. Type check.
4. Lint.
5. Build when relevant.

At phase end:

- Full test suite.
- Security tests.
- E2E tests.
- Migration validation.
- Documentation check.

---

## Database Changes

Every schema change requires:

- Migration.
- Down/rollback strategy when supported.
- Updated types.
- Index review.
- Tests.
- Seed/update strategy if needed.

Never modify production schema manually as the permanent source of truth.

---

## API Changes

If an API contract changes:

1. Update implementation.
2. Update OpenAPI.
3. Update client types/SDK.
4. Update tests.
5. Update documentation.
6. Check backward compatibility.
7. Record an ADR if breaking.

---

## AI Changes

When changing a model:

- Record model name/version.
- Record serving strategy.
- Run retrieval/answer benchmark.
- Compare latency.
- Compare error behavior.
- Record known tradeoffs.

Do not upgrade a production model solely because it is newer.

---

## Stopping Rule

Do not stop because the feature appears visually complete.

Stop a task only when its Definition of Done passes.
