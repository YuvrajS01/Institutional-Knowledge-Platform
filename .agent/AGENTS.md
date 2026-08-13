# Institutional Knowledge Platform — AGENTS.md

## 0. Purpose

You are the primary autonomous engineering agent for the **Institutional Knowledge Platform**.

Your job is to take the product from repository initialization to a working, tested, documented production-oriented MVP by executing the repository's specifications in dependency order.

The authoritative product documents are:

1. `.agent/product/PRD.md`
2. `.agent/design/UI_UX_DESIGN.md`
3. `.agent/architecture/TECHNICAL_SPEC.md`
4. `.agent/api/API_SPEC_SHEET.md`
5. `.agent/ai/AI_LLM_ARCHITECTURE.md`

Supporting execution documents:

6. `.agent/architecture/ARCHITECTURE_DECISIONS.md`
7. `.agent/engineering/DEFINITION_OF_DONE.md`
8. `.agent/engineering/DEVELOPMENT_WORKFLOW.md`
9. `.agent/planning/PHASE_PLAN.md`
10. `.agent/planning/TASK_MANIFEST.md`
11. `.agent/quality/TEST_STRATEGY.md`
12. `.agent/quality/SECURITY_CHECKLIST.md`
13. `.agent/operations/ENVIRONMENT_MATRIX.md`
14. `.agent/ai/AI_EVALUATION.md`

Read the relevant source document before implementing a feature. Never rely on memory when the repository contains a specification for the behavior.

---

# 1. Mission

Build a secure, multi-tenant, search-first institutional document platform with:

- Document upload and storage
- OCR and text extraction
- Editable metadata extraction
- Document versioning and supersession
- Approval/publishing workflow
- Hybrid lexical + semantic search
- Multilingual semantic retrieval
- Reranking
- Bookmarks
- Important dates
- Notifications
- Permission-aware RAG
- Source-grounded institutional AI
- Admin analytics
- Audit logs

The MVP must remain simpler than a full ERP.

Do not expand into unrelated domains such as attendance, marks, fee collection, or complete student-information-system replacement unless an explicit project change request is added.

---

# 2. Product North Star

The system should make this possible:

> A user remembers only the meaning of a notice and can find the authoritative source in seconds.

The AI layer must improve discovery and interpretation without becoming the source of institutional truth.

**Source of truth = approved institutional documents + structured metadata.**

---

# 3. Document Authority Hierarchy

When documents conflict, use this precedence:

1. Explicitly approved/current institutional source.
2. Published current document version.
3. Department-authoritative published source.
4. Older published source.
5. Draft/internal source.
6. AI-generated content.

AI output must never silently outrank an institutional source.

---

# 4. Reading and Planning Rules

Before starting any significant feature:

1. Read the relevant section of `.agent/product/PRD.md`.
2. Read the corresponding UI/UX section.
3. Read technical requirements.
4. Read API requirements.
5. Read AI architecture requirements when the feature touches search, OCR, embeddings, RAG, summaries, or classification.
6. Check architecture decisions for existing choices.
7. Check phase/task dependencies.
8. Implement the smallest coherent increment.
9. Run required tests and quality checks.
10. Update documentation when behavior changes.

If two specifications conflict:

- Prefer the newest explicit decision in `.agent/architecture/ARCHITECTURE_DECISIONS.md`.
- If no decision exists, prefer security and tenant isolation.
- Then prefer the more conservative interpretation.
- Record an ADR before making a lasting architectural change.

Do not block on asking a human for minor implementation choices. Make a reversible, well-documented choice.

---

# 5. Autonomous Decision Policy

The agent is expected to make routine technical decisions autonomously.

## 5.1 Decide autonomously

Examples:

- Exact folder names when consistent with the technical specification.
- Component naming.
- Internal utility structure.
- Test naming.
- Library patch/minor version selection.
- Whether to refactor obviously duplicated code.
- SQL index selection after inspecting query patterns.
- Unit-test cases beyond the minimum acceptance criteria.
- Reasonable UI microcopy.

## 5.2 Create an ADR before changing

Examples:

- Replacing PostgreSQL/pgvector with a different persistence architecture.
- Replacing REST with GraphQL/gRPC.
- Changing the main frontend/backend framework.
- Introducing a new required infrastructure dependency.
- Switching the default LLM/embedding family.
- Removing a security control specified by the docs.
- Changing tenant-isolation strategy.
- Changing document lifecycle states.
- Changing API contracts in a breaking way.

## 5.3 Never decide silently

Never silently:
- Disable authorization.
- Skip tenant filters.
- Expose restricted document content.
- Let drafts appear to ordinary users.
- Let an LLM answer unsupported institutional questions as fact.
- Delete historical document versions.
- Store secrets in source control.
- Bypass failing tests to declare completion.

---

# 6. Repository Bootstrapping

Before feature work:

1. Create a clear monorepo or equivalent modular repository.
2. Create backend, frontend, worker, shared package, and docs structure.
3. Add formatting/linting/type checking.
4. Add `.env.example`.
5. Add local development instructions.
6. Add database migration framework.
7. Add test framework.
8. Add CI checks.
9. Add pre-commit/pre-push quality hooks where practical.
10. Add Docker Compose for local infrastructure where feasible.

Recommended structure:

```text
institutional-knowledge-platform/
├── AGENTS.md
├── PRD.md
├── DESIGN_DOC_UI_UX.md
├── TECHNICAL_SPEC.md
├── API_SPEC_SHEET.md
├── AI_LLM_ARCHITECTURE.md
├── docs/
│   ├── ARCHITECTURE_DECISIONS.md
│   ├── DEFINITION_OF_DONE.md
│   ├── DEVELOPMENT_WORKFLOW.md
│   ├── PHASE_PLAN.md
│   ├── TASK_MANIFEST.md
│   ├── TEST_STRATEGY.md
│   ├── SECURITY_CHECKLIST.md
│   ├── ENVIRONMENT_MATRIX.md
│   └── AI_EVALUATION.md
├── apps/
│   ├── web/
│   ├── api/
│   └── worker/
├── packages/
│   ├── shared/
│   ├── ui/
│   ├── config/
│   └── sdk/
├── infra/
│   ├── docker/
│   ├── migrations/
│   └── scripts/
├── tests/
│   ├── integration/
│   ├── e2e/
│   ├── fixtures/
│   └── evals/
└── README.md
```

Equivalent organization is allowed if the repository uses a different framework, but responsibilities must remain separated.

---

# 7. Core Engineering Rules

## 7.1 Type safety

- TypeScript strict mode.
- Avoid `any`.
- Validate all external input.
- Share API/domain types where appropriate.
- Never trust client-supplied IDs or tenant IDs.

## 7.2 Validation

Validate at every boundary:

- HTTP request
- file upload
- queue payload
- environment variables
- third-party provider responses
- model outputs

Use schema validation such as Zod or equivalent.

## 7.3 Error handling

Errors must have:

- Stable machine-readable code.
- Human-readable message.
- Request/correlation ID.
- Safe details.

Never expose stack traces or provider secrets.

## 7.4 Logging

Logs should be structured and useful.

Include:
- request ID
- tenant/institution ID where safe
- user ID where appropriate
- operation
- latency
- error code

Never log:
- passwords
- access tokens
- refresh tokens
- raw private document content unnecessarily
- model prompts containing sensitive content unless explicitly required and protected

## 7.5 Database

- Use migrations.
- Add foreign keys.
- Add indexes based on access patterns.
- Use UTC timestamps.
- Use UUID IDs.
- Preserve historical document versions.
- Use transactions for state transitions.

## 7.6 API

Follow `.agent/api/API_SPEC_SHEET.md` exactly unless an ADR changes it.

All API endpoints must:
- Validate input.
- Authorize the actor.
- Enforce institution scope.
- Return consistent errors.
- Have tests.

## 7.7 Frontend

- Follow `.agent/design/UI_UX_DESIGN.md`.
- Responsive by default.
- Accessible by default.
- Prefer reusable components.
- Keep domain/business logic out of visual components.

---

# 8. Multi-Tenancy Is Mandatory

Every institution-specific read/write operation must have an institution scope.

Preferred pattern:

```text
authenticated user
        ↓
membership
        ↓
institution scope
        ↓
authorization
        ↓
query
```

Never:

```text
request.institution_id
        ↓
database query
```

without membership validation.

Every repository/service method that accesses tenant-owned data must make tenant scope explicit.

Add cross-tenant regression tests.

---

# 9. Document Lifecycle

Use the state model from the specifications:

```text
DRAFT
  ↓
IN_REVIEW
  ↓
APPROVED
  ↓
PUBLISHED
  ↓
SUPERSEDED
  ↓
ARCHIVED
```

Only authorized actors may perform each transition.

Ordinary users must not retrieve unpublished documents.

A superseded version may remain accessible only where policy permits, but it must never silently outrank the current version.

---

# 10. Document Ingestion Rules

The ingestion pipeline is asynchronous.

Expected sequence:

```text
Upload
→ validation
→ malware/file checks
→ object storage
→ document record
→ text extraction
→ OCR if needed
→ metadata extraction
→ date extraction
→ chunking
→ embeddings
→ indexing
→ ready for human review
```

Each job must be:
- Idempotent.
- Retryable.
- Observable.
- Tenant-aware.
- Safe to resume.

Never require the browser to wait for OCR/embedding work synchronously.

---

# 11. AI Rules

## 11.1 AI is not authoritative

AI-generated metadata must be editable.

AI-generated answers must be source-grounded.

## 11.2 Retrieval before generation

Do not answer institutional questions from model memory.

Use:

```text
permission-aware retrieval
→ ranking
→ context construction
→ LLM
```

## 11.3 Permission-aware retrieval

Authorization must happen before model context creation.

Never retrieve restricted text and rely on post-generation filtering.

## 11.4 Citations

Institutional answers should include:

- document title
- document/version ID
- page where possible
- source link

## 11.5 Unsupported questions

When evidence is insufficient:

> I couldn't find an official institutional document confirming this.

Do not invent answers.

## 11.6 Provider abstraction

All model access must use interfaces/adapters.

Never scatter vendor-specific SDK calls throughout business logic.

---

# 12. Search Rules

The default search architecture is:

```text
lexical search
    +
semantic search
    ↓
candidate merge
    ↓
reranker
    ↓
final results
```

Search quality is a first-class feature.

Do not replace hybrid search with LLM-only query answering.

Every search feature must include evaluation coverage.

---

# 13. Frontend/Backend Boundary

Backend owns:

- Authorization.
- Publication state.
- Tenant isolation.
- Ranking.
- Version semantics.
- Audience logic.
- AI grounding.
- Audit rules.

Frontend owns:

- Presentation.
- Interaction.
- Local UI state.
- Optimistic UI only where safe.

Never duplicate security/business rules only in the frontend.

---

# 14. Testing Requirements

Every implemented feature should have the appropriate level of testing:

### Unit

Pure functions, parsers, ranking logic, validators, state transitions.

### Integration

Database repositories, API handlers, storage adapters, queues, provider adapters.

### E2E

Critical user flows.

### Security

Tenant isolation, permission boundaries, unauthorized access.

### AI evaluation

Retrieval and answer quality.

No feature is complete if its core behavior cannot be automatically verified.

---

# 15. Required Critical E2E Flows

At minimum:

1. Admin logs in.
2. Admin uploads a PDF.
3. Processing completes.
4. Admin reviews extracted metadata.
5. Admin publishes document.
6. Student searches exact phrase.
7. Student searches vague natural-language description.
8. Student opens source document.
9. Student sees important date.
10. Student saves document.
11. Authorized admin updates document/version.
12. Old version is marked superseded.
13. Student sees current version.
14. Student asks institutional AI a grounded question.
15. AI cites the source.
16. Student cannot retrieve restricted content.
17. Cross-institution resource access is denied.

---

# 16. Definition of Progress

A task is not done because code exists.

A task is done when:

- Implementation exists.
- Tests exist.
- Tests pass.
- Lint/type checks pass.
- API contract is accurate.
- UI matches requirements.
- Security rules are enforced.
- Documentation is updated.
- No known blocker remains.
- The task is recorded as completed in `.agent/planning/TASK_MANIFEST.md`.

See `.agent/engineering/DEFINITION_OF_DONE.md`.

---

# 17. Autonomous Execution Loop

For each task:

```text
READ
 ↓
UNDERSTAND
 ↓
CHECK DEPENDENCIES
 ↓
IMPLEMENT
 ↓
TEST
 ↓
REVIEW
 ↓
DOCUMENT
 ↓
MARK COMPLETE
 ↓
SELECT NEXT UNBLOCKED TASK
```

Do not implement tasks out of dependency order merely because they are convenient.

---

# 18. Failure Handling

If a build/test fails:

1. Determine whether the failure is implementation, environment, dependency, or specification-related.
2. Fix the smallest root cause.
3. Re-run the narrow failing test.
4. Run the broader relevant suite.
5. Record any architectural change.
6. Continue when green.

If a dependency is unavailable:
- Prefer an interface/stub.
- Keep the contract stable.
- Add a local implementation where practical.
- Document the integration gap.
- Do not fake production behavior in tests.

---

# 19. Scope Discipline

Do not add features because they are interesting.

Before implementing a new feature ask:

1. Is it required by the PRD?
2. Is it required by an existing dependency?
3. Does it directly support the MVP?
4. Would omitting it block a core flow?

If all answers are no, defer it.

Create `docs/BACKLOG.md` for deferred ideas rather than implementing them opportunistically.

---

# 20. Security Gate

Before declaring MVP complete, verify:

- Cross-tenant access tests.
- RBAC tests.
- Audience restriction tests.
- Signed URL behavior.
- Upload validation.
- File-size limits.
- Malware scanning integration or explicit operational fallback.
- Rate limiting.
- Secure secret handling.
- Audit logs.
- No restricted-content leakage through RAG.
- No unrestricted object storage.
- No sensitive data in client logs.

Use `.agent/quality/SECURITY_CHECKLIST.md`.

---

# 21. AI Quality Gate

Before enabling institutional AI for real users:

- Retrieval evaluation exists.
- Citation correctness is tested.
- Unsupported questions are handled.
- Current-version precedence is tested.
- Permission-aware retrieval is tested.
- Prompt injection from documents is tested.
- Cross-tenant leakage tests are passing.
- Model/provider timeouts are handled.
- AI cost/latency metrics exist.

---

# 22. Environment Strategy

Support at least:

- `local`
- `test`
- `staging`
- `production`

Never point local development to production institutional data.

See `.agent/operations/ENVIRONMENT_MATRIX.md`.

---

# 23. Git and Commit Rules

Preferred commit style:

```text
feat(documents): add draft upload flow
feat(search): add hybrid retrieval
fix(auth): enforce institution membership
test(rag): add cross-tenant citation test
docs(api): update upload contract
refactor(search): extract ranking service
```

Keep commits cohesive.

Do not mix unrelated refactors with feature work unless required.

---

# 24. Pull Request / Review Checklist

Before review:

- What problem does this solve?
- Which specification section does it implement?
- What APIs changed?
- What data changed?
- What security implications exist?
- What tests were added?
- What performance risks exist?
- What documentation changed?

---

# 25. When Specifications Need Change

Do not edit the main specification merely to make a failed implementation appear compliant.

Instead:

1. Identify the discrepancy.
2. Propose the change.
3. Record the rationale in an ADR.
4. Update the affected specification.
5. Update task dependencies.
6. Continue from the new baseline.

---


# 23. Git Safety and Workflow

Repository changes must follow `.agent/engineering/GIT_WORKFLOW.md`.

Before modifying an existing repository, inspect:

```bash
git status --short
git branch --show-current
git log -5 --oneline
git diff
git diff --cached
```

Treat existing uncommitted or untracked user changes as **user-owned by default**.

Never:
- discard user changes;
- run destructive cleanup commands to "fix" the workspace;
- develop directly on protected `main`;
- force-push shared/protected branches;
- commit secrets or private institutional data;
- knowingly commit broken critical-path code.

For normal work:

```text
inspect
→ create/switch task branch
→ implement
→ test
→ review diff
→ atomic commit
→ continue
```

Use the branch/commit/merge/rebase/rollback policies in `.agent/engineering/GIT_WORKFLOW.md`.

Task IDs from `.agent/planning/TASK_MANIFEST.md` should be referenced in branch names or commit messages where practical.

The agent must never assume that a clean-looking workspace means it is safe to delete or reset files. Verify ownership of changes first.

# 26. Final Autonomous Directive

Continue implementing the highest-priority unblocked task in `.agent/planning/TASK_MANIFEST.md`.

Do not stop after scaffolding.

Do not stop after compiling.

Do not stop after a demo.

Continue until the current phase's Definition of Done is satisfied.

When all MVP tasks are complete, run the full verification suite and produce a final implementation report containing:

- Features completed.
- Tests passed.
- Known limitations.
- Security status.
- AI evaluation status.
- Deployment requirements.
- Deferred backlog.

The repository should be understandable and runnable by another engineering agent without conversational context.

## Git Branch and PR Policy

Follow `.agent/engineering/GIT_WORKFLOW.md`.

The canonical workflow is:

```text
task
 ↓
task branch
 ↓
implementation
 ↓
tests
 ↓
atomic commit
 ↓
push
 ↓
pull request
 ↓
CI/review
 ↓
main
 ↓
release tag
```

Do not work directly on `main`.

Agents may create branches, implement tasks, test, commit, push, and open PRs. By default, agents must **not merge PRs into `main` without human approval**.

Map task IDs to branch names and commits where practical, for example:

```text
feat/P5-007-hybrid-search
feat(search): implement hybrid retrieval [P5-007]
```

Do not create a permanent `develop` branch unless an explicit architecture decision requires it. Deployment environments such as staging and production are not separate Git branches by default.

Before changing an existing repository, inspect Git status and preserve user-owned work.

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
