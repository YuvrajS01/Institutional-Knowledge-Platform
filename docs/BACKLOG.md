# Backlog — Deferred Ideas

Ideas that are useful but intentionally deferred. Revisit after MVP validation; do not implement opportunistically.

## Audit & Security

- Audit coverage for institution/department admin actions (currently only document events are recorded).
- MFA for administrators (security-checklist item).
- Password reset / email verification (depends on the email adapter, Phase 7).
- Rate limiting on all read routes (only auth/write routes and some reads carry per-route limits today).
- Refresh-token rotation wired into the web client (client stores tokens in localStorage today).
- `minio-init` style bucket provisioning documented as an operational step for non-Docker deployments.

## Documents

- Department-scope editing: restrict department admins to their department's documents.
- `summary` in document list responses (arrives with extraction, Phase 3).
- Large-file streaming for storage reads/writes (buffers are fine for MVP sizes).

## Frontend

- TanStack Query on the web (defer until the search UI, P5-010).
- Password/session hardening (httpOnly cookies instead of localStorage).

## AI / Models

- Model benchmarks for the default LLM/embedding/OCR choices before production enablement (see `.agent/ai/AI_LLM_ARCHITECTURE.md`).

## Operations

- Backup/restore verification scripts (Phase 9).
- Load-testing for search and async processing (Phase 9).
