# Phase Plan

## Phase 0 — Repository Foundation

Goal:
Create a runnable engineering baseline.

Outputs:
- Monorepo structure.
- TypeScript configuration.
- Lint/format/type checking.
- CI.
- Environment validation.
- Docker Compose for local infrastructure.
- Base README.

Gate:
- Clean install.
- All base checks pass.

---

## Phase 1 — Identity and Multi-Tenancy

Build:
- User model.
- Institution model.
- Membership model.
- Roles.
- Authentication.
- Session/token handling.
- Department model.
- Tenant-aware data access.

Gate:
- User can authenticate.
- User can belong to institution.
- Cross-tenant read/write is denied.

---

## Phase 2 — Document Core

Build:
- Document schema.
- Version schema.
- Object storage.
- Upload flow.
- Document status state machine.
- Draft editing.
- Audit logs.

Gate:
- Admin can create/upload document.
- Original file stored.
- Document record linked correctly.

---

## Phase 3 — Document Processing

Build:
- Text extraction.
- OCR adapter.
- Processing queue.
- Metadata extraction.
- Important date extraction.
- Chunking.
- Processing status UI.

Gate:
- Native PDF and scanned PDF can become searchable text.
- Processing failures are visible/retryable.

---

## Phase 4 — Publishing and Admin

Build:
- Approval queue.
- Approve/publish actions.
- Archive.
- Supersede.
- Version history.
- Admin dashboard.

Gate:
- Only authorized staff can publish.
- Ordinary users see published content only.
- Current version precedence works.

---

## Phase 5 — Search

Build:
- Full-text search.
- Filters.
- Semantic embeddings.
- pgvector.
- Hybrid ranking.
- Search result UI.
- Search analytics.
- Unresolved queries.

Gate:
- Exact search works.
- Vague semantic search works.
- Filters work.
- Search quality benchmark exists.

---

## Phase 6 — Document Consumption

Build:
- Document detail.
- PDF viewer.
- Summary.
- Important dates.
- Related documents.
- Bookmarks.
- Share links.

Gate:
- Main student workflow can be completed end-to-end.

---

## Phase 7 — Notifications

Build:
- Notification model.
- In-app notifications.
- Email adapter.
- Relevance rules.
- Deadline reminders.

Gate:
- User receives relevant notification.
- Read state works.

---

## Phase 8 — Institutional AI

Build:
- RAG service.
- Permission-aware retrieval.
- Reranker.
- LLM provider abstraction.
- Local model adapter.
- Cloud provider adapter if required.
- Citations.
- Refusal/unsupported-answer behavior.
- AI feedback.

Gate:
- Grounded answer cites the source.
- Restricted source cannot leak.
- Unsupported answer is safely handled.

---

## Phase 9 — Quality and Hardening

Build:
- E2E suite.
- Security suite.
- Load tests.
- Search evaluation.
- AI evaluation.
- Observability.
- Backup/restore verification.
- Deployment scripts.

Gate:
- MVP Definition of Done passes.

---

## Phase 10 — Production Readiness

Build:
- Production environment.
- Secrets management.
- Monitoring.
- Alerting.
- Runbooks.
- Migration process.
- Data retention controls.
- Operational documentation.

Gate:
- Fresh environment can be deployed from repository documentation.
