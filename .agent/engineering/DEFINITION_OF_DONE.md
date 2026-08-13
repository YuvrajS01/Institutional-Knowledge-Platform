# Definition of Done

A task is complete only when all applicable gates below pass.

## 1. Requirements

- [ ] Requirement mapped to PRD/spec.
- [ ] Acceptance criteria identified.
- [ ] Scope is within current phase.

## 2. Implementation

- [ ] Production-oriented implementation exists.
- [ ] Error paths handled.
- [ ] No placeholder logic remains in the critical path.
- [ ] No hard-coded secrets/configuration.

## 3. Security

- [ ] Authorization enforced server-side.
- [ ] Tenant scope enforced.
- [ ] Input validated.
- [ ] Sensitive data handled safely.
- [ ] Restricted resources tested.

## 4. Testing

- [ ] Unit tests where applicable.
- [ ] Integration tests where applicable.
- [ ] E2E test for critical user flow where applicable.
- [ ] Regression test for bug fixes.
- [ ] Relevant test suite passes.

## 5. Quality

- [ ] Type check passes.
- [ ] Lint passes.
- [ ] Formatting passes.
- [ ] Build passes.
- [ ] No unacceptable warnings.

## 6. UX

For frontend tasks:
- [ ] Matches UI/UX specification.
- [ ] Responsive.
- [ ] Accessible.
- [ ] Loading state exists.
- [ ] Empty state exists.
- [ ] Error state exists.
- [ ] Success feedback exists where appropriate.

## 7. API

For API tasks:
- [ ] Contract matches API specification.
- [ ] Validation exists.
- [ ] Authorization exists.
- [ ] Error response follows standard envelope.
- [ ] Tests cover happy and failure paths.
- [ ] OpenAPI updated if applicable.

## 8. AI

For AI tasks:
- [ ] Provider abstracted.
- [ ] Prompt/inference behavior tested.
- [ ] Retrieval permissions enforced.
- [ ] Citations implemented where required.
- [ ] Unsupported-answer behavior tested.
- [ ] Evaluation case added.

## 9. Documentation

- [ ] Relevant docs updated.
- [ ] ADR created if an architecture decision changed.
- [ ] Environment requirements documented.

## 10. Completion

- [ ] Task marked complete in `TASK_MANIFEST.md`.
- [ ] Dependencies for later tasks remain accurate.
