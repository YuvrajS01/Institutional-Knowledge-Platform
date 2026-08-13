# INSTRUCTIONS.md — Autonomous Build Instructions

**Project:** Institutional Knowledge Platform  
**Audience:** Autonomous coding / agentic software-engineering agent  
**Mode:** Autonomous implementation with verification  
**Primary objective:** Build the complete project described by the repository documentation, in dependency order, without requiring the user to micromanage individual implementation steps.

---

# 1. Your Role

You are the primary autonomous engineering agent for this repository.

The repository already contains the product, design, architecture, API, AI, testing, security, Git, and execution specifications.

Your responsibility is to:

1. Understand the specifications.
2. Inspect the current repository and Git state.
3. Determine what is already implemented.
4. Select the highest-priority unblocked task.
5. Implement it completely.
6. Test and verify it.
7. Commit it using the project's Git policy.
8. Update the relevant task/documentation state.
9. Continue to the next unblocked task.
10. Repeat until the current MVP scope is implemented and all required gates pass.

Do not treat this file as a replacement for the detailed specifications.

**`AGENTS.md` is the primary engineering operating contract.**

---

# 2. Mandatory Reading Order

Before writing application code, read:

```text
AGENTS.md

.agent/product/PRD.md

.agent/design/UI_UX_DESIGN.md

.agent/architecture/TECHNICAL_SPEC.md
.agent/architecture/ARCHITECTURE_DECISIONS.md

.agent/ai/AI_LLM_ARCHITECTURE.md
.agent/ai/AI_EVALUATION.md

.agent/api/API_SPEC_SHEET.md

.agent/planning/README_AGENT_BUILD.md
.agent/planning/PHASE_PLAN.md
.agent/planning/TASK_MANIFEST.md
.agent/planning/TASK_CONTRACT.md

.agent/engineering/DEVELOPMENT_WORKFLOW.md
.agent/engineering/IMPLEMENTATION_GUIDE.md
.agent/engineering/GIT_WORKFLOW.md
.agent/engineering/DEFINITION_OF_DONE.md

.agent/quality/TEST_STRATEGY.md
.agent/quality/SECURITY_CHECKLIST.md

.agent/operations/ENVIRONMENT_MATRIX.md
```

Then use `.agent/planning/FILE_MAP.md` to locate additional documentation when needed.

Do not repeatedly reread every document after every task. Read the documents relevant to the task currently being implemented.

---

# 3. First Action: Inspect the Repository

Before changing anything, inspect:

```bash
git status --short
git branch --show-current
git log -10 --oneline
git diff
git diff --cached
git remote -v
```

Then inspect the repository tree.

Determine:

- What files already exist.
- What code already exists.
- Whether a framework has already been selected.
- Whether dependencies are already installed.
- Whether database migrations exist.
- Whether CI exists.
- Whether the repository contains changes not created by you.

### Critical safety rule

Treat existing uncommitted or untracked changes as **user-owned by default**.

Never destroy them.

Do not use:

```bash
git reset --hard
git clean -fd
```

to obtain a clean workspace.

Do not overwrite existing work merely because your preferred implementation differs.

Follow `.agent/engineering/GIT_WORKFLOW.md`.

---

# 4. Determine the Current Build Position

Read:

```text
.agent/planning/TASK_MANIFEST.md
.agent/planning/PHASE_PLAN.md
```

Determine:

1. Which tasks are already complete.
2. Which tasks are partially implemented.
3. Which tasks are blocked.
4. Which task is the highest-priority unblocked task.

Do not assume the repository is empty.

If code already exists, inspect and reuse it.

Do not rebuild working functionality without a reason.

---

# 5. The Autonomous Execution Loop

For every task:

```text
READ
 ↓
UNDERSTAND
 ↓
CHECK DEPENDENCIES
 ↓
INSPECT EXISTING CODE
 ↓
PLAN LOCALLY
 ↓
IMPLEMENT
 ↓
TEST
 ↓
SECURITY REVIEW
 ↓
DIFF REVIEW
 ↓
DOCUMENT
 ↓
COMMIT
 ↓
MARK TASK DONE
 ↓
SELECT NEXT TASK
```

Continue this loop without waiting for the user after every task.

---

# 6. Task Selection Rules

Select the highest-priority task that:

- Is not complete.
- Has all dependencies complete.
- Is not blocked by an external requirement.
- Belongs to the active phase.
- Produces meaningful progress toward MVP.

Prefer:

```text
P0 > P1 > P2
```

and dependency order over convenience.

Do not skip foundational tasks merely because UI work is more visually interesting.

---

# 7. Do Not Ask for Routine Decisions

Make normal engineering decisions autonomously.

Examples include:

- Component names.
- File placement.
- Utility structure.
- Test structure.
- Exact SQL indexes.
- Minor dependency versions.
- Error-message wording.
- Internal abstractions.
- Reasonable responsive behavior.
- Whether to add a regression test.

Use the existing architecture and repository conventions.

---

# 8. When You May Need Human Input

Ask the user only when progress genuinely depends on an external decision that cannot be safely inferred.

Examples:

- Production credentials that cannot be substituted locally.
- A product decision that contradicts the PRD.
- A legal/compliance requirement not specified anywhere.
- Two incompatible architectural requirements with no established resolution.
- A destructive production operation requiring explicit authorization.

Before asking, make the maximum safe progress possible.

Do not ask questions whose answers are already present in the repository.

---

# 9. Architecture Principles

The target architecture is:

```text
Web
  ↓
API
  ↓
PostgreSQL + pgvector
  ↓
Redis / Queue
  ↓
Workers
  ↓
OCR / Metadata / Embeddings / Notifications
  ↓
Object Storage
```

AI is provider-agnostic:

```text
AI Interface
 ├── Local LLM
 ├── Cloud LLM
 ├── Local Embeddings
 ├── Cloud Embeddings
 ├── Local OCR
 └── Cloud OCR
```

Do not tightly couple business logic to a single AI vendor.

---

# 10. MVP Priority

Build in this broad order:

## Phase 0

Repository foundation.

## Phase 1

Authentication, institutions, departments, membership, RBAC, tenant isolation.

## Phase 2

Document upload, storage, document records, versions, lifecycle, audit logs.

## Phase 3

Text extraction, OCR, metadata extraction, dates, chunks, processing jobs.

## Phase 4

Approval, publishing, supersession, version history.

## Phase 5

Full-text search, embeddings, semantic search, hybrid search, reranking.

## Phase 6

Document viewer, summaries, dates, related documents, bookmarks, sharing.

## Phase 7

Notifications.

## Phase 8

Permission-aware RAG, institutional AI, citations, evaluation, prompt-injection protection.

## Phase 9

E2E, security, performance, observability, backups, deployment hardening.

Do not build the final AI assistant before the document and retrieval foundations are working.

---

# 11. Product Rule

The key product loop is:

```text
Upload
 ↓
Understand
 ↓
Index
 ↓
Search
 ↓
Open source
 ↓
Understand
 ↓
Act
```

The MVP is successful when an administrator can publish an official document and a student can discover it quickly using normal or vague natural-language search.

---

# 12. Document Processing Rules

The intended pipeline is:

```text
Upload
 ↓
Validation
 ↓
Malware/file checks
 ↓
Object storage
 ↓
Document record
 ↓
Text extraction
 ↓
OCR if needed
 ↓
Metadata extraction
 ↓
Important-date extraction
 ↓
Chunking
 ↓
Embeddings
 ↓
Indexing
 ↓
Review/publish
```

All background processing should be:

- Asynchronous.
- Idempotent.
- Retryable.
- Observable.
- Tenant-aware.

Do not make the browser wait synchronously for long-running OCR or embedding tasks.

---

# 13. Search Rules

Search must evolve through:

```text
Full-text
 ↓
Filters
 ↓
Semantic retrieval
 ↓
Hybrid retrieval
 ↓
Reranking
```

Do not replace search with an LLM chatbot.

For standard searches, do not invoke an LLM unnecessarily.

Search should remain useful even when the AI service is unavailable.

---

# 14. Institutional AI Rules

The AI is not the institutional source of truth.

Truth comes from:

```text
Approved + published institutional documents
+
structured metadata
```

The institutional AI should use:

```text
User question
 ↓
Authorization
 ↓
Permission-aware retrieval
 ↓
Hybrid search
 ↓
Reranking
 ↓
Context construction
 ↓
LLM
 ↓
Answer + citations
```

Never retrieve restricted information and merely hope the LLM will avoid mentioning it.

Authorization must occur before the content enters the AI context.

---

# 15. AI Answer Requirements

Every authoritative institutional answer should include a source.

Example:

```text
The examination form deadline is 18 August 2026.

Source:
Examination Form Submission Notice
Published: 08 Aug 2026
Page: 1
```

When the system cannot find sufficient authoritative evidence:

```text
I couldn't find an official institutional document confirming this.
```

Never fabricate dates, rules, policies, or institutional procedures.

---

# 16. Model Selection Policy

Do not over-engineer the AI layer.

Initial candidates from the AI specification include:

```text
OCR:
PaddleOCR

Embeddings:
BGE-M3

Reranker:
BGE reranker family

Local LLM:
Qwen-class 7B/8B or 14B model

Development serving:
Ollama

Production serving:
vLLM
```

These are candidates, not immutable requirements.

If selecting a different model:

- Explain the reason in an ADR when material.
- Benchmark it.
- Record model/version.
- Record serving configuration.
- Add/update evaluation cases.

Choose the smallest model that satisfies quality requirements.

---

# 17. Git Rules

Follow:

```text
.agent/engineering/GIT_WORKFLOW.md
```

Normal flow:

```text
inspect status
 ↓
create task branch
 ↓
implement
 ↓
test
 ↓
review diff
 ↓
commit
```

Suggested branch:

```text
feat/P5-007-hybrid-search
```

Suggested commit:

```text
feat(search): implement hybrid retrieval [P5-007]
```

Never:

- Push secrets.
- Commit private institutional documents.
- Force-push shared/protected branches.
- Delete user changes.
- Commit knowingly broken critical-path work.

---

# 18. Task Completion

A task is complete only when the relevant requirements of:

```text
.agent/engineering/DEFINITION_OF_DONE.md
```

are satisfied.

That usually means:

- Code implemented.
- Tests implemented.
- Tests passing.
- Typecheck passing.
- Lint passing.
- Build passing where applicable.
- Security checks passing where applicable.
- API documentation updated.
- UI states implemented where applicable.
- AI evaluation updated where applicable.
- Task manifest updated.

Do not mark tasks complete merely because the application starts.

---

# 19. Testing Expectations

Use:

```text
Unit tests
Integration tests
E2E tests
Security tests
Search evaluation
AI evaluation
```

At minimum, verify the critical path:

```text
Admin login
 → upload
 → process
 → review
 → publish
 → student search
 → open document
 → save
 → ask AI
 → inspect citation
```

Also verify:

```text
cross-tenant access → denied
student admin access → denied
draft visibility → denied
restricted RAG access → denied
superseded document precedence → correct
```

Every bug discovered should result in a regression test where practical.

---

# 20. Security Is Not Optional

Before any feature is considered complete, consider:

- Tenant isolation.
- RBAC.
- Audience authorization.
- File validation.
- Object storage permissions.
- Signed URLs.
- Rate limits.
- Secret handling.
- Audit logs.
- RAG data leakage.
- Prompt injection.
- Cross-institution access.
- Error-message leakage.

Consult:

```text
.agent/quality/SECURITY_CHECKLIST.md
```

---

# 21. Documentation Synchronization

When behavior changes:

- Update the API specification if an API changed.
- Update UI/UX documentation if user behavior changed.
- Update architecture decisions if architecture changed.
- Update AI evaluation if AI behavior changed.
- Update task manifest when task state changes.
- Update implementation guidance when setup changes.

Documentation is part of the product.

---

# 22. Do Not Create Scope Creep

Do not implement these merely because they are attractive future ideas:

- Mobile native app.
- WhatsApp bot.
- Telegram integration.
- Complete ERP.
- Attendance.
- Marks.
- Payments.
- Kubernetes.
- Microservices for every module.
- Multi-region infrastructure.
- Giant 70B+ models without benchmark evidence.

Put useful future ideas into a backlog instead.

---

# 23. Development Philosophy

Prefer:

```text
Simple
Modular
Testable
Observable
Secure
Replaceable
```

Avoid:

```text
Prematurely distributed
Over-abstracted
AI-dependent
Unverified
Magic
```

A modular monolith plus background workers is preferred for MVP over premature microservices.

---

# 24. First Milestone

The first meaningful product milestone is:

> **Admin uploads an official PDF → system processes and publishes it → student finds it through search → student opens the authoritative document.**

Do not optimize for a beautiful demo before this flow works reliably.

---

# 25. First AI Milestone

After retrieval is stable:

> **Student asks a natural-language institutional question → system retrieves the correct current source → LLM answers → source citation is shown.**

This is the first AI feature that should be treated as production-critical.

---

# 26. Autonomous Continuation

After successfully completing one task:

1. Update the task status.
2. Commit the work.
3. Inspect the remaining dependency graph.
4. Select the next highest-priority unblocked task.
5. Continue.

Do not stop simply because one task or one phase has finished.

Continue until:

- MVP tasks are complete, or
- a genuine blocking dependency requires human action.

---

# 27. If You Encounter Existing Code

Never assume that a blank-looking plan means the implementation should start from scratch.

First inspect:

- Existing modules.
- Existing database schema.
- Existing routes.
- Existing tests.
- Existing UI components.
- Existing configuration.
- Existing providers.
- Existing Git history.

Prefer incremental improvement over wholesale replacement.

---

# 28. If You Encounter Broken Code

Use this loop:

```text
reproduce
 ↓
identify root cause
 ↓
write/identify regression test
 ↓
fix smallest root cause
 ↓
run targeted test
 ↓
run broader tests
 ↓
review diff
 ↓
commit
```

Do not work around defects by disabling tests or security controls.

---

# 29. If an External Provider Is Missing

Do not block the entire project merely because a production service is unavailable.

Use:

- Local implementation.
- Mock.
- Adapter stub.
- Test fixture.

Keep the real interface intact.

Example:

```text
LLMProvider
 ├── OllamaProvider
 └── MockLLMProvider
```

The mock must not be presented as production AI.

---

# 30. Final Completion Standard

Do not declare the project complete until the full MVP gate has been evaluated:

### Product

- [ ] Core document workflow works.
- [ ] Search works.
- [ ] Document viewing works.
- [ ] Versioning works.
- [ ] Important dates work.
- [ ] Bookmarks work.
- [ ] Notifications work where included.
- [ ] Institutional AI works with citations.

### Engineering

- [ ] Tests pass.
- [ ] Typecheck passes.
- [ ] Lint passes.
- [ ] Production build passes.
- [ ] Migrations are reproducible.
- [ ] CI passes.

### Security

- [ ] Tenant isolation verified.
- [ ] RBAC verified.
- [ ] Restricted documents protected.
- [ ] Upload security verified.
- [ ] RAG permission boundaries verified.
- [ ] Secrets protected.

### AI

- [ ] Search evaluation passes defined threshold.
- [ ] RAG evaluation exists.
- [ ] Citation correctness verified.
- [ ] Unsupported answers handled.
- [ ] Prompt injection tested.
- [ ] Model/provider configuration documented.

### Operations

- [ ] Environment configuration documented.
- [ ] Backups documented.
- [ ] Monitoring documented.
- [ ] Deployment procedure documented.
- [ ] Rollback procedure documented.

---

# 31. Final Instruction

You are not being asked to merely generate a prototype.

You are being asked to **engineer the repository into a maintainable, testable, secure product according to its specifications**.

Be autonomous.

Be conservative with architecture.

Be rigorous with Git.

Prefer evidence over assumptions.

Prefer tests over confidence.

Prefer source documents over model memory.

Prefer incremental progress over giant rewrites.

When one task is complete, continue to the next unblocked task.

When the repository reaches the MVP completion gate, produce a final engineering report at:

```text
docs/FINAL_IMPLEMENTATION_REPORT.md
```

The report must contain:

- What was implemented.
- What was tested.
- Which checks passed.
- Which AI models/providers were configured.
- Search evaluation results.
- AI evaluation results.
- Security test results.
- Deployment instructions.
- Known limitations.
- Deferred backlog.
- Recommended next steps.

Do not claim completion if required verification is missing.


## Git Execution Sequence

For each meaningful task, follow:

```text
inspect Git state
→ create task branch
→ implement
→ test
→ review diff
→ atomic commit
→ push branch
→ open pull request
→ wait for CI/review gate
→ continue with the next task once integration is complete
```

Agents should not merge into `main` by default. Human approval remains the default merge gate until the repository explicitly changes this policy.

## Model Switching / Project State

This project may be developed by switching between AI coding models/tools rather than running multiple agents simultaneously.

Before starting or continuing work, read:

```text
.agent/planning/PROJECT_STATE.md
```

Then verify its claims against Git and the actual repository.

Before handing work to another model/tool, update `PROJECT_STATE.md` with:

- current phase;
- current task;
- current branch;
- completed work;
- work in progress;
- blockers;
- verification results;
- next steps.

Do not treat `PROJECT_STATE.md` as a replacement for Git or the task manifest. Git and the actual codebase are authoritative.
