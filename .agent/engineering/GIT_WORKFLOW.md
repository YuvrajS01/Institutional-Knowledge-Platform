# Git Workflow for Autonomous Agents

**Project:** Institutional Knowledge Platform  
**Purpose:** Safe, auditable Git workflow for autonomous and human-assisted development  
**Status:** Required engineering policy  
**Version:** 1.1

---

## 1. Canonical Branch Model

Use a simple trunk-oriented workflow:

```text
main
 │
 ├── feat/P2-003-document-upload
 ├── feat/P5-007-hybrid-search
 ├── feat/P8-009-ai-ask
 ├── fix/P1-007-tenant-isolation
 └── security/P8-013-rag-boundary
        │
        ▼
       Pull Request
        │
        ▼
       CI / Review
        │
        ▼
       main
        │
      tag/release
        │
   ┌────┴─────┐
   ▼          ▼
staging   production
```

### Rules

- `main` is the stable integration branch.
- Never develop directly on `main`.
- Never force-push `main`.
- Never rewrite published `main` history.
- Every meaningful task should use a task branch.
- Branches should map to task IDs whenever practical.
- CI must pass before merge.
- Production deployments must be traceable to a Git commit/tag.

Do **not** introduce a permanent `develop` branch or full GitFlow process for MVP unless a later architecture decision explicitly requires it.

---

## 2. Branch Types

Use:

```text
feat/<task-id>-<short-name>
fix/<task-id>-<short-name>
security/<task-id>-<short-name>
perf/<task-id>-<short-name>
refactor/<task-id>-<short-name>
test/<task-id>-<short-name>
docs/<task-id>-<short-name>
chore/<task-id>-<short-name>
```

Examples:

```text
feat/P1-004-authentication
feat/P2-003-document-upload
feat/P5-007-hybrid-search
feat/P8-009-ai-ask
fix/P1-007-tenant-isolation
security/P8-013-rag-boundary
```

One branch normally corresponds to one meaningful task from the task manifest.

---

## 3. Git Is Not the Deployment Environment

Do not create permanent Git branches merely because environments exist.

Preferred:

```text
main
  ↓
CI/CD
  ├── staging
  └── production
```

A commit can be promoted from staging to production without creating a separate `production` Git branch.

This keeps Git history and deployment state conceptually separate.

---

## 4. Start-of-Work Safety Check

Before modifying an existing repository:

```bash
git status --short
git branch --show-current
git log -10 --oneline
git diff
git diff --cached
git remote -v
```

Inspect untracked files too.

Determine:

- Current branch.
- Existing user changes.
- Staged/unstaged changes.
- Recent history.
- Remote configuration.

### Never destroy existing work

Treat unknown uncommitted/untracked changes as user-owned by default.

Never use destructive commands merely to make the workspace clean:

```bash
git reset --hard
git clean -fd
```

Never overwrite changes from another contributor without understanding them.

---

## 5. Normal Agent Branch Lifecycle

For an unstarted task:

```text
Read task
  ↓
Inspect status
  ↓
Update local main
  ↓
Create task branch
  ↓
Implement
  ↓
Test
  ↓
Review diff
  ↓
Commit
  ↓
Push
  ↓
Open PR
  ↓
CI
  ↓
Review/approval
  ↓
Merge
  ↓
Delete branch
```

Recommended setup:

```bash
git fetch --all --prune
git switch main
git pull --ff-only
git switch -c feat/P2-003-document-upload
```

If the repository already has an established integration process, follow that process.

---

## 6. Pull Requests

Every meaningful task should result in a pull request unless repository policy explicitly allows direct integration.

A PR should identify:

- Task ID.
- Problem being solved.
- Specification references.
- Main implementation changes.
- Database/API changes.
- Security implications.
- Tests executed.
- Known limitations.

Example:

```text
feat(search): implement hybrid retrieval [P5-007]
```

### PR merge policy

For the initial development period:

> **Agents may create branches, implement tasks, run tests, commit, push, and open pull requests autonomously. Merging into `main` should require human approval.**

This safety boundary can be relaxed later after CI reliability and agent behavior are proven.

---

## 7. CI Gate

A PR should not merge until applicable CI checks pass.

Minimum CI:

```text
install
 ↓
lint
 ↓
typecheck
 ↓
unit tests
 ↓
integration tests
 ↓
build
```

Add:

- security/dependency checks
- migration validation
- E2E tests
- search evaluation
- AI evaluation

where applicable to the changed task.

A failed CI check must not be bypassed merely to merge.

---

## 8. Task-to-Git Traceability

Maintain this relationship:

```text
Specification
    ↓
Task ID
    ↓
Branch
    ↓
Commit
    ↓
Pull Request
    ↓
Merge
    ↓
Release
```

Example:

```text
P5-007
  ↓
feat/P5-007-hybrid-search
  ↓
feat(search): implement hybrid retrieval [P5-007]
  ↓
PR #42
  ↓
main
  ↓
v0.3.0
```

This makes the project auditable for both humans and autonomous agents.

---

## 9. Atomic Commits

A commit should represent one coherent change.

Good:

```text
feat(documents): add versioned document model [P2-001]
feat(storage): add signed upload service [P2-003]
test(documents): cover lifecycle transitions [P2-005]
```

Do not create a single giant commit such as:

```text
feat: build entire platform
```

Commit granularity should optimize reviewability and reversibility, not maximize commit count.

---

## 10. Commit Format

Preferred:

```text
<type>(<scope>): <imperative summary> [TASK-ID]
```

Allowed types:

- `feat`
- `fix`
- `test`
- `docs`
- `refactor`
- `perf`
- `security`
- `chore`
- `build`
- `ci`

Examples:

```text
feat(auth): implement login [P1-004]
feat(documents): add upload service [P2-003]
feat(search): implement hybrid retrieval [P5-007]
test(rag): add permission boundary tests [P8-013]
fix(auth): enforce institution membership [P1-007]
security(storage): make document bucket private
```

---

## 11. Pre-Commit Quality Gate

Before committing:

```bash
git diff --check
git status
git diff --stat
```

Run all relevant:

```text
tests
lint
typecheck
build
```

Review the actual diff.

Only intended files may be included.

---

## 12. Human-Owned Changes

### If changes already exist

Do not assume they were created by the agent.

### If changes are unrelated

Work around them.

### If changes overlap the task

Inspect and integrate them carefully.

### If ownership is unclear

Treat them as user-owned and preserve them.

Use a separate task branch or worktree where necessary.

---

## 13. Rebase Policy

Rebasing is allowed on private/unshared task branches.

Do not rebase shared branches merely to make history look cleaner.

Never force-push protected/shared branches.

If a private branch genuinely needs rewriting:

```bash
git push --force-with-lease
```

Never use raw `git push --force` on protected/shared branches.

---

## 14. Merge Conflicts

When a conflict occurs:

1. Inspect both sides.
2. Read relevant specifications.
3. Determine intended behavior.
4. Preserve valid changes.
5. Resolve intentionally.
6. Run focused tests.
7. Run broader checks.
8. Review the final diff.

Do not blindly choose `ours` or `theirs`.

If the conflict represents a real architecture disagreement, create/update an ADR.

---

## 15. Database Migration Policy

Schema changes must be committed with migration files.

```text
schema design
  ↓
migration
  ↓
application code
  ↓
tests
  ↓
PR
  ↓
merge
```

Never rely on manually modified production databases as the permanent implementation.

A Git revert does not automatically reverse a database migration.

Production migration rollback must follow the migration tool's documented strategy.

---

## 16. API Contract Changes

For API changes:

1. Update implementation.
2. Update OpenAPI/schema.
3. Update generated clients/SDK where used.
4. Update tests.
5. Update docs.
6. Evaluate backward compatibility.
7. Create an ADR for material architectural or breaking changes.

---

## 17. Release Tags

Use tags for meaningful product milestones.

Examples:

```text
v0.1.0-foundation
v0.2.0-documents
v0.3.0-search
v0.4.0-ai-alpha
v1.0.0-mvp
```

Semantic versioning may be used once the release process stabilizes.

Every production deployment should be traceable to:

- Git commit.
- Tag/release.
- Database migration state.

---

## 18. Production Rollback

Preferred rollback path:

```text
identify known-good commit
        ↓
redeploy/revert
        ↓
verify health
        ↓
investigate root cause
        ↓
create corrective fix
```

Prefer `git revert` for shared history rather than rewriting it.

---

## 19. Hotfixes

Production fixes use a dedicated branch:

```text
fix/<task-id>-<short-name>
```

or:

```text
hotfix/<short-name>
```

Then:

```text
fix branch
  ↓
tests
  ↓
PR
  ↓
main
  ↓
patch release/tag
```

Do not patch production manually and leave Git out of sync.

---

## 20. Sensitive Files

Never commit:

```text
.env
.env.*
*.pem
*.key
credentials.json
service-account.json
database dumps
production exports
private institutional documents
user-uploaded documents
access tokens
API keys
refresh tokens
model credentials
```

Use:

- `.env.example`
- CI/CD secrets
- Secret managers
- Deployment secret configuration

---

## 21. Generated and Runtime Data

Normally ignore:

```text
node_modules/
dist/
build/
.next/
coverage/
logs/
uploads/
storage/
data/
models/
model-cache/
huggingface-cache/
ollama-data/
ocr-cache/
embedding-cache/
```

Do commit generated artifacts only when they are intentionally part of the repository contract, such as:

- database migrations
- lockfiles
- intentionally versioned OpenAPI artifacts
- intentionally generated SDKs

---

## 22. Worktrees

Use worktrees when:

- multiple agents/tasks run in parallel;
- long-running work should not disturb another task;
- the integration worktree must remain clean.

Example:

```text
workspace/
├── main/
├── feature-search/
└── feature-rag/
```

All worktrees must follow the same Git, security and testing policies.

---

## 23. Agent Merge Authority

Default policy:

```text
Agent:
  branch ✅
  code ✅
  test ✅
  commit ✅
  push ✅
  PR ✅
  merge ❌ (human approval)
```

A future repository policy may grant automated merge authority after:

- stable CI;
- reliable tests;
- reviewed branch protection;
- demonstrated agent safety.

High-risk changes should continue to require human approval:

- authentication/security changes;
- database architecture;
- destructive migrations;
- AI provider/model changes;
- production infrastructure;
- breaking APIs;
- privacy/compliance changes.

---

## 24. Final Git Rule

> Never sacrifice repository safety, history integrity, or user changes merely to make autonomous execution convenient.
