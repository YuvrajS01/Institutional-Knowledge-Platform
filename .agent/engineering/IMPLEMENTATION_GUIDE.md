# Implementation Guide

This guide is the concrete execution companion to `AGENTS.md`.

## 1. Recommended Stack Baseline

### Web

- React/Next.js
- TypeScript
- Tailwind or equivalent token-based styling
- TanStack Query

### API

- Node.js
- TypeScript
- Fastify/NestJS
- Zod

### Data

- PostgreSQL
- pgvector
- Redis

### Storage

- S3-compatible object storage

### Workers

- BullMQ/Redis or equivalent

### AI

- PaddleOCR
- BGE-M3
- Qwen-class local model
- vLLM in production
- Provider abstraction for cloud/local

If the existing repository already establishes an equivalent stack, retain it unless it conflicts with the specifications.

---

## 2. Suggested Service Boundaries

```text
apps/api
  auth
  institutions
  departments
  documents
  search
  bookmarks
  notifications
  analytics
  ai
  audit

apps/worker
  document processing
  OCR
  metadata
  embeddings
  notifications

apps/web
  public/user application
  admin application

packages/shared
  domain types
  schemas
  enums
  error codes

packages/ai
  provider interfaces
  adapters
  prompts
  evaluation helpers
```

---

## 3. Database Implementation Order

Create tables in dependency order:

```text
institutions
   ↓
users
   ↓
departments
   ↓
memberships
   ↓
documents
   ↓
document_versions
   ↓
document_metadata
   ↓
document_chunks
   ↓
tags/bookmarks/notifications/audit/search events
```

Add indexes based on actual endpoints.

Likely indexes:
- institution_id
- institution_id + status
- institution_id + department_id
- institution_id + published_at
- document_id + version_number
- bookmark user/document
- full-text search vector
- embedding vector index when data volume justifies it

---

## 4. Document Processing Contract

Each processing stage should receive a stable job object:

```json
{
  "job_id": "uuid",
  "institution_id": "uuid",
  "document_id": "uuid",
  "version_id": "uuid",
  "attempt": 1,
  "payload": {}
}
```

Every worker must:
- verify tenant context.
- verify document/version existence.
- be idempotent.
- persist status.
- record errors safely.
- retry transient failures.

---

## 5. AI Provider Contracts

Use provider-level interfaces.

```typescript
interface EmbeddingProvider {
  modelName(): string;
  embed(inputs: string[]): Promise<number[][]>;
}

interface LLMProvider {
  modelName(): string;
  generate(request: GenerateRequest): Promise<GenerateResponse>;
}

interface RerankerProvider {
  modelName(): string;
  rerank(
    query: string,
    candidates: SearchCandidate[]
  ): Promise<SearchCandidate[]>;
}

interface OCRProvider {
  name(): string;
  extract(input: OCRInput): Promise<OCRResult>;
}
```

Keep adapters thin.

---

## 6. Prompt Management

Prompts should be versioned source files rather than long inline strings.

Suggested:

```text
packages/ai/prompts/
  document-classification/
    v1.txt
  metadata-extraction/
    v1.txt
  summarization/
    v1.txt
  rag-answer/
    v1.txt
```

Record prompt version in AI telemetry where appropriate.

Never include secrets in prompts.

---

## 7. AI Output Validation

All structured model output must be schema validated.

Example:

```typescript
const metadataSchema = z.object({
  title: z.string().nullable(),
  documentType: z.string().nullable(),
  department: z.string().nullable(),
  tags: z.array(z.string()),
  dates: z.array(
    z.object({
      value: z.string(),
      type: z.string()
    })
  )
});
```

A model response that fails validation must not silently become database state.

---

## 8. Search Service

The search service should expose one stable interface:

```typescript
interface SearchService {
  search(input: SearchInput): Promise<SearchResult>;
}
```

The implementation can evolve:

```text
MVP:
Postgres FTS + pgvector

Later:
Postgres + OpenSearch

Later:
Dedicated managed search/vector infrastructure
```

The API should not change merely because the internal search engine changes.

---

## 9. RAG Service

Recommended pipeline:

```text
question
  ↓
authorization context
  ↓
query normalization
  ↓
hybrid search
  ↓
reranking
  ↓
context builder
  ↓
prompt
  ↓
LLM
  ↓
structured answer
  ↓
citation validation
  ↓
API response
```

Citation validation should verify that referenced documents/chunks were actually retrieved.

---

## 10. Frontend Feature Order

Build in this order:

1. Authentication.
2. Home/search shell.
3. Search results.
4. Document detail.
5. Admin document management.
6. Upload/review.
7. Approval queue.
8. Important dates.
9. Bookmarks.
10. Notifications.
11. Ask Institution.

Do not build a polished dashboard before the search/document workflow works.

---

## 11. UI State Requirements

Every async view should have:

- loading
- success
- empty
- error

Long-running processing should show progress/status rather than a generic spinner.

---

## 12. API Client Generation

Prefer generating typed client code from OpenAPI once the contract stabilizes.

Avoid duplicating request/response interfaces manually across multiple packages.

---

## 13. Seed Data

Create safe synthetic seed data:

- 1 institution
- 3 departments
- sample users for each role
- 10–30 documents
- versions
- important dates
- tags
- bookmarks
- notifications

Include:
- normal PDF
- scanned PDF
- superseded document
- restricted document
- multilingual document

---

## 14. Demo Environment

Provide one command or documented sequence that gets a new developer from zero to:

- database
- migrations
- seed data
- web app
- API
- worker
- local AI provider if available

The project should be usable by another coding agent without manual guesswork.

---

## 15. Autonomous Recovery

When an implementation assumption fails:

1. Inspect current code.
2. Search repository for established patterns.
3. Check relevant specification.
4. Choose the smallest compatible correction.
5. Add/adjust test.
6. Record ADR only if architecture changes.
7. Continue.

Do not rebuild large sections merely because the first implementation is imperfect.
