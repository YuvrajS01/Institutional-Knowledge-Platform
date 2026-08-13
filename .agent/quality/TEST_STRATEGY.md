# Test Strategy

## 1. Test Pyramid

```text
             E2E
            /          Integration
          /             Unit Tests
```

Use the smallest test level that proves the behavior.

---

## 2. Unit Tests

Cover:

- Validators.
- Document lifecycle transitions.
- Search score calculations.
- Query parsing.
- Audience matching.
- Date extraction normalization.
- Metadata normalization.
- Citation formatting.
- Provider fallback.
- Retry policy.

---

## 3. Integration Tests

Cover:

- Database repositories.
- Tenant filtering.
- Object storage.
- Queue jobs.
- OCR adapters.
- Embedding adapters.
- Search queries.
- API handlers.
- Notification adapters.

---

## 4. E2E Tests

Critical flow:

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

Additional:
- supersession
- notification
- restricted document
- cross-tenant access

---

## 5. Security Tests

Must prove:

- User from institution A cannot access institution B.
- Student cannot access admin actions.
- Student cannot retrieve drafts.
- Restricted audience cannot be bypassed.
- RAG cannot expose unauthorized source content.
- Signed URLs expire.
- Uploads reject invalid types.
- Oversized files are rejected.
- Rate limits trigger.

---

## 6. Search Evaluation

Maintain a dataset containing real or anonymized examples of:

- Exact title queries.
- Partial titles.
- Natural-language queries.
- Vague-memory queries.
- Date-based queries.
- Multilingual queries.
- Hinglish queries.

Track:
- Recall@5
- Recall@10
- MRR
- NDCG
- zero-result rate
- search-to-open rate

---

## 7. AI Evaluation

For every expected question:

- expected source document
- expected page/chunk
- expected key fact

Evaluate:

- Groundedness.
- Citation correctness.
- Answer correctness.
- Unsupported claim rate.
- Refusal correctness.

---

## 8. Regression Rule

Every production bug gets a regression test.

Every AI failure found in evaluation becomes a permanent evaluation case.

---

## 9. Test Data

Use synthetic/anonymized institutional documents for repository tests.

Do not commit real sensitive institutional documents.

Fixtures should include:

- normal text PDF
- scanned PDF
- multi-page notice
- superseded notice
- restricted notice
- multilingual notice
- malformed file
