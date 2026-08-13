# Architecture Decisions

This file is the persistent record of significant architecture decisions.

## ADR-001 — PostgreSQL + pgvector for MVP

**Status:** Accepted

### Decision

Use PostgreSQL as the primary database and pgvector for initial semantic retrieval.

### Rationale

- One primary data system.
- Strong relational modeling for institutional documents/workflows.
- Vector support without a second database.
- Lower operational complexity for MVP.
- Can migrate/extend to a dedicated search engine later.

### Consequence

Search abstractions must not expose pgvector-specific behavior outside the search module.

---

## ADR-002 — Asynchronous document processing

**Status:** Accepted

### Decision

OCR, extraction, metadata enrichment, chunking, embeddings, and indexing run as asynchronous jobs.

### Rationale

These tasks are slower and failure-prone compared with HTTP request handling.

### Consequence

Document processing has explicit job states and retries.

---

## ADR-003 — AI provider abstraction

**Status:** Accepted

### Decision

LLM, embeddings, rerankers, and OCR are accessed through provider interfaces.

### Rationale

Supports:
- self-hosted deployments
- cloud fallback
- model upgrades
- institution-specific deployment requirements

---

## ADR-004 — Source-grounded institutional AI

**Status:** Accepted

### Decision

Institutional AI answers are generated from permission-aware retrieval results and must cite source documents.

### Rationale

Institutional information is authoritative and often time-sensitive. Model memory is not an acceptable source of truth.

---

## ADR-005 — Current-version precedence

**Status:** Accepted

### Decision

Search and AI retrieval prefer current approved/published versions and penalize superseded/archived versions.

### Rationale

Prevents users from acting on outdated instructions.

---

## ADR-006 — REST API for MVP

**Status:** Accepted

### Decision

Use REST/JSON under `/api/v1`.

### Rationale

Simple browser integration, easy debugging, clear resource model, strong ecosystem support.

---

## ADR-007 — Local-first AI development

**Status:** Accepted

### Decision

Development must support local OCR, embeddings, and LLM execution.

### Rationale

Enables low-cost development, privacy-preserving testing, and eventual private/on-premise deployments.
