# Institutional Knowledge Platform — Technical Specification

**Document:** Technical Specification  
**Version:** 1.0  
**Status:** MVP Architecture  
**Date:** 2026-08-13

---

## 1. Technical Objective

Build a multi-tenant SaaS platform that ingests institutional documents, extracts and indexes their content, exposes hybrid search, and provides source-grounded knowledge retrieval.

Primary qualities:
- Secure tenant isolation
- Search quality
- Document integrity
- Async ingestion
- Horizontal scalability
- Explainable AI retrieval

---

## 2. Recommended Stack

### Frontend

- React
- TypeScript
- Vite or Next.js
- Tailwind CSS
- TanStack Query
- Zod
- PDF.js or browser-native PDF rendering

### Backend

Recommended:
- Node.js
- TypeScript
- Fastify or NestJS

### Primary Database

- PostgreSQL
- pgvector for initial vector search

### Object Storage

S3-compatible storage:
- AWS S3
- Cloudflare R2
- Supabase Storage
- MinIO for self-hosted deployments

### Search

MVP:
- PostgreSQL full-text search + pgvector

Scale-up option:
- OpenSearch/Elasticsearch

### Queue

- Redis + BullMQ
or
- Managed queue such as SQS

### OCR

Options:
- Tesseract for self-hosted baseline
- Cloud OCR for higher accuracy
- Google Vision / AWS Textract / Azure Document Intelligence depending on deployment

### AI

Model provider abstraction:
- Embedding model
- LLM provider

Do not hard-code application logic to one model vendor.

---

## 3. High-Level Architecture

```text
                   ┌─────────────────────┐
                   │       Web App       │
                   │ React / Next.js     │
                   └──────────┬──────────┘
                              │ HTTPS
                   ┌──────────▼──────────┐
                   │      API Layer      │
                   │ Node.js / TypeScript│
                   └───────┬────┬───────┘
                           │    │
             ┌─────────────┘    └──────────────┐
             ▼                                  ▼
     ┌───────────────┐                   ┌──────────────┐
     │  PostgreSQL   │                   │ Object Store │
     │ + pgvector    │                   │ PDFs/images  │
     └───────┬───────┘                   └──────────────┘
             │
             │ events/jobs
             ▼
     ┌──────────────────┐
     │ Queue + Workers  │
     └────────┬─────────┘
              │
       ┌──────┼───────────────────────┐
       ▼      ▼          ▼            ▼
     OCR    Parsing    Embedding    Metadata
```

---

## 4. Multi-Tenancy

Every major entity contains `institution_id`.

Tenant context should be derived from:
- Authenticated user.
- Institution membership.
- Explicit institution switching where allowed.

Security requirement:

> Never trust a tenant ID supplied by the browser without verifying membership.

For PostgreSQL, consider Row Level Security for high-assurance deployments.

---

## 5. Core Data Model

### Institution

```text
institutions
- id UUID PK
- name
- slug
- logo_url
- status
- timezone
- settings JSONB
- created_at
- updated_at
```

### User

```text
users
- id UUID PK
- email
- name
- phone
- avatar_url
- status
- created_at
- updated_at
```

### Membership

```text
institution_memberships
- id UUID PK
- institution_id FK
- user_id FK
- role
- department_id nullable
- course nullable
- semester nullable
- created_at
```

### Department

```text
departments
- id UUID PK
- institution_id FK
- name
- code
- status
- created_at
```

### Document

```text
documents
- id UUID PK
- institution_id FK
- current_version_id
- title
- slug
- document_type
- status
- department_id
- published_at
- effective_from
- effective_to
- created_by
- created_at
- updated_at
```

### Document Version

```text
document_versions
- id UUID PK
- document_id FK
- version_number
- storage_key
- mime_type
- size_bytes
- sha256
- extracted_text
- ocr_status
- page_count
- created_by
- created_at
```

### Document Metadata

```text
document_metadata
- document_id FK
- academic_year
- course
- semester
- audience JSONB
- tags JSONB
- entities JSONB
- extracted_dates JSONB
- extra JSONB
```

### Chunks

```text
document_chunks
- id UUID PK
- document_version_id FK
- page_number
- chunk_index
- content
- token_count
- embedding vector
- metadata JSONB
```

### Tags

```text
tags
- id UUID PK
- institution_id FK
- name
- slug
```

### Bookmarks

```text
bookmarks
- id UUID PK
- user_id FK
- document_id FK
- created_at
```

### Notifications

```text
notifications
- id UUID PK
- institution_id FK
- user_id FK
- type
- title
- body
- entity_type
- entity_id
- read_at
- created_at
```

### Audit Logs

```text
audit_logs
- id UUID PK
- institution_id FK
- actor_user_id FK
- action
- entity_type
- entity_id
- metadata JSONB
- created_at
```

### Search Events

```text
search_events
- id UUID PK
- institution_id FK
- user_id nullable
- query
- filters JSONB
- result_count
- clicked_document_id nullable
- latency_ms
- created_at
```

---

## 6. Document Ingestion Pipeline

### Pipeline

```text
Upload
  ↓
Virus scan
  ↓
File validation
  ↓
Object storage
  ↓
Document registration
  ↓
Text extraction
  ↓
OCR when necessary
  ↓
Metadata extraction
  ↓
Chunking
  ↓
Embedding generation
  ↓
Search indexing
  ↓
Ready for review
```

### Job states

- QUEUED
- PROCESSING
- COMPLETED
- FAILED
- RETRYING

Each job must be idempotent.

---

## 7. OCR Strategy

Determine whether OCR is necessary.

Pseudo-flow:

```text
Extract text from PDF
       │
       ├── adequate text → continue
       │
       └── insufficient text → OCR
```

Store:
- Original file.
- Extracted text.
- OCR text.
- OCR provider/version.
- Extraction metadata.

Never overwrite the original source file.

---

## 8. Metadata Extraction

Use a deterministic + AI-assisted pipeline.

### Deterministic

- File name.
- Document properties.
- Dates.
- Page count.
- MIME type.

### AI-assisted

- Title normalization.
- Document type classification.
- Department prediction.
- Important date extraction.
- Summary.
- Tags.
- Audience.
- Named entities.

All AI metadata must be reviewable before publication.

---

## 9. Chunking Strategy

Default:
- ~300–700 tokens per chunk.
- 10–20% overlap.
- Preserve page number.
- Preserve document/version ID.

Chunk boundaries should prefer:
- Headings.
- Paragraphs.
- Lists.
- Table boundaries when practical.

---

## 10. Search Architecture

### Hybrid retrieval

Run:

1. PostgreSQL full-text retrieval.
2. Vector similarity retrieval.
3. Metadata filter.
4. Merge candidate sets.
5. Rank.
6. Optional reranker.

Conceptually:

```text
Final Score =
  lexical_weight * lexical_score
+ semantic_weight * semantic_score
+ metadata_weight * metadata_score
+ freshness_weight * freshness_score
+ authority_weight * authority_score
```

### Ranking principles

Strongly prefer:
- Published documents.
- Approved documents.
- Current versions.
- Exact metadata matches.
- Highly relevant semantic matches.

Penalize:
- Superseded versions.
- Archived versions.
- Draft documents for normal users.

---

## 11. Query Processing

Natural-language queries can be normalized into:

```json
{
  "intent": "find_document",
  "keywords": ["exam", "form", "late fee"],
  "date_range": {
    "from": null,
    "to": null
  },
  "department": null,
  "document_type": null,
  "course": null,
  "semester": null
}
```

But the original query must also be preserved for semantic retrieval.

---

## 12. AI Retrieval / RAG Architecture

```text
User question
      ↓
Query normalization
      ↓
Hybrid retrieval
      ↓
Candidate chunks
      ↓
Optional reranking
      ↓
Context window
      ↓
LLM
      ↓
Answer + citations
```

### RAG rules

- Only approved/published content is eligible for regular end-user answers.
- Restrict results to tenant.
- Prefer current versions.
- Include document/page citations.
- Reject unsupported claims.
- Do not expose hidden document content through a citation that the user cannot access.

---

## 13. Answer Generation Contract

The model should return structured data:

```json
{
  "answer": "The exam form deadline is 18 August 2026.",
  "confidence": "high",
  "citations": [
    {
      "document_id": "uuid",
      "version_id": "uuid",
      "page": 1,
      "quote": "..."
    }
  ],
  "grounded": true
}
```

The API can decide what portion of source text can safely be displayed.

---

## 14. Permissions

Recommended roles:

### STUDENT

Read published documents permitted for audience.

### FACULTY

Student permissions plus faculty/department content.

### DEPARTMENT_ADMIN

Create, edit, submit documents within assigned department.

### APPROVER

Review and approve documents.

### INSTITUTION_ADMIN

Full institution-level administration.

### PLATFORM_ADMIN

Platform-level administration.

---

## 15. Authorization Model

Use:
- RBAC for broad capabilities.
- ABAC-like conditions for audience restrictions.

Example:

```text
Allow if:
membership.institution_id == document.institution_id
AND document.status == PUBLISHED
AND (
  document.audience == PUBLIC
  OR document.audience contains user's department
  OR document.audience contains user's course
  OR document.audience contains user's role
)
```

---

## 16. Storage

Suggested key format:

```text
/{institution_id}/documents/{document_id}/v{version}/original.pdf
```

Processed artifacts:

```text
/{institution_id}/documents/{document_id}/v{version}/
    extracted.txt
    ocr.json
    preview/page-001.png
```

Never let users construct arbitrary storage keys.

Use signed URLs for private objects.

---

## 17. Security Controls

- HTTPS only.
- Strong password hashing if local auth is used.
- OAuth/OIDC support.
- MFA for administrators.
- JWT/session expiration.
- Refresh token rotation if applicable.
- Rate limits.
- Upload size limits.
- Content-type validation.
- Malware scanning.
- File name sanitization.
- HTML/script sanitization.
- SQL parameterization/ORM.
- Audit logging.
- Tenant isolation tests.
- Secret manager.
- Backup encryption.

---

## 18. Observability

Track:
- API latency.
- Error rates.
- Queue depth.
- OCR failure rate.
- AI failure rate.
- Search latency.
- Vector DB latency.
- Object storage errors.
- Notification delivery.

Use:
- Structured logs.
- Metrics.
- Distributed tracing where appropriate.

---

## 19. Caching

Cache:
- Public metadata.
- Frequently viewed documents.
- Popular queries if safe.
- Taxonomy.
- Institution settings.

Do not cache personalized or restricted responses without tenant/user-aware keys.

---

## 20. Background Jobs

Recommended workers:

- `document.process`
- `document.ocr`
- `document.extract_metadata`
- `document.embed`
- `document.index`
- `notification.dispatch`
- `analytics.aggregate`

---

## 21. API Gateway / Service Structure

Recommended modular backend:

```text
src/
  modules/
    auth/
    institutions/
    users/
    departments/
    documents/
    search/
    ai/
    notifications/
    bookmarks/
    analytics/
    audit/
  common/
    auth/
    errors/
    validation/
    storage/
    queue/
  infrastructure/
    db/
    cache/
    search/
```

---

## 22. Frontend Structure

```text
src/
  app/
  components/
  features/
    auth/
    search/
    documents/
    calendar/
    bookmarks/
    notifications/
    admin/
    ai/
  hooks/
  lib/
  routes/
  types/
```

Prefer feature-oriented modules instead of a large global component folder.

---

## 23. API Principles

- RESTful JSON APIs.
- `/api/v1/...`
- Consistent error envelope.
- Request IDs.
- Pagination.
- Cursor pagination for large lists.
- Idempotency keys for critical write operations.
- RFC 3339 timestamps in UTC.
- UUID identifiers.

---

## 24. Error Envelope

```json
{
  "error": {
    "code": "DOCUMENT_NOT_FOUND",
    "message": "Document not found.",
    "details": {},
    "request_id": "req_123"
  }
}
```

Never expose stack traces to clients.

---

## 25. Rate Limits

Illustrative MVP defaults:

| Endpoint family | Limit |
|---|---:|
| Authentication | 10/min/IP |
| Search | 60/min/user |
| AI answers | 20/min/user |
| Upload | 30/hour/user |
| General reads | 300/min/user |

Tune based on measured traffic.

---

## 26. Deployment

### Initial SaaS

- Frontend: Vercel or equivalent.
- API: containerized Node service.
- PostgreSQL: managed.
- Object storage: managed S3-compatible.
- Redis: managed.
- Worker: separate container/service.

### Growth

Introduce:
- Dedicated search cluster.
- Read replicas.
- CDN.
- Separate AI inference workers.
- Per-tenant storage quotas.
- Multi-region if required.

---

## 27. Backup and Recovery

Minimum:
- Daily database backups.
- Point-in-time recovery where supported.
- Object storage versioning.
- Disaster recovery runbook.

Targets:
- RPO ≤ 24 hours for MVP.
- RTO ≤ 8 hours for MVP.

---

## 28. Search Evaluation

Create an evaluation dataset from real user searches.

Each query should have:
- Expected relevant document IDs.
- Query type.
- Difficulty.
- Department.
- Language.

Measure:
- Recall@5.
- Recall@10.
- MRR.
- NDCG.
- Zero-result rate.
- Search-to-open rate.

---

## 29. Internationalization

Design for:
- English.
- Hindi.

Future:
- Bilingual metadata.
- Cross-language embeddings.
- Hindi OCR.
- Transliteration-aware search.

---

## 30. Technical Decision

For the first production version, **PostgreSQL + pgvector + object storage + background workers** is preferable to immediately introducing a separate Elasticsearch/OpenSearch cluster.

The architecture should keep the search interface abstract enough that a dedicated search engine can be introduced when scale or ranking requirements justify it.
