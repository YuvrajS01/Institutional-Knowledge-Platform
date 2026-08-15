# Institutional Knowledge Platform — API Specification Sheet

**Document:** API Spec Sheet  
**Version:** 1.0  
**Base URL:** `/api/v1`  
**Format:** JSON  
**Auth:** Bearer token / secure session  
**Date:** 2026-08-13

---

## 1. API Conventions

### Authentication

```http
Authorization: Bearer <access_token>
```

### Tenant context

Tenant-scoped endpoints require the active institution:

```http
X-Institution-Id: <uuid>
```

The header is validated against the authenticated user's memberships before
any tenant-scoped query runs; it is never trusted directly (see `AGENTS.md` §8).
Responses use `400 VALIDATION_ERROR` for a missing/malformed header and
`403 FORBIDDEN` when the user has no membership or lacks the required
capability (RBAC, see `TECHNICAL_SPEC.md` §14–15).

### Content Type

```http
Content-Type: application/json
```

### Timestamps

RFC 3339 UTC.

Example:

```text
2026-08-13T10:30:00Z
```

### IDs

UUIDs.

### Pagination

Recommended:

```text
?page=1&limit=20
```

For high-volume collections, prefer:

```text
?cursor=<cursor>&limit=20
```

---

## 2. Common Response Envelope

### Success

```json
{
  "data": {},
  "meta": {}
}
```

### Error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more fields are invalid.",
    "details": {
      "title": ["Required"]
    },
    "request_id": "req_12345"
  }
}
```

---

# 3. Authentication

## POST /auth/login

Authenticate a user.

### Request

```json
{
  "email": "student@example.edu",
  "password": "********"
}
```

### Response

```json
{
  "data": {
    "user": {
      "id": "uuid",
      "name": "Example Student",
      "email": "student@example.edu"
    },
    "access_token": "token",
    "expires_in": 3600
  }
}
```

---

## POST /auth/logout

Invalidate current session/token where supported.

---

## GET /auth/me

Returns the current user and institution memberships.

### Response

```json
{
  "data": {
    "id": "uuid",
    "name": "Example Student",
    "email": "student@example.edu",
    "memberships": [
      {
        "institution_id": "uuid",
        "institution_name": "Example College",
        "role": "STUDENT",
        "department": "CSE",
        "course": "B.Tech",
        "semester": 6
      }
    ]
  }
}
```

---

# 4. Institutions

## GET /institutions/current

Return current institution.

## PATCH /institutions/current

Update institution settings. `INSTITUTION_ADMIN` only.

### Request

```json
{
  "name": "Example College",
  "timezone": "Asia/Kolkata",
  "settings": {
    "max_upload_mb": 25
  }
}
```

---

# 5. Departments

## GET /departments

Query parameters:

```text
?page=1
&limit=20
&search=computer
&status=ACTIVE
```

## POST /departments

Admin only.

```json
{
  "name": "Computer Science and Engineering",
  "code": "CSE"
}
```

## GET /departments/{department_id}

## PATCH /departments/{department_id}

## DELETE /departments/{department_id}

Use soft delete/deactivation in production.

---

# 6. Documents

## POST /documents

Create document metadata record and initiate upload.

Recommended approach:
1. Client requests upload.
2. API returns signed upload URL.
3. Client uploads directly to object storage.
4. Client confirms upload.
5. Processing begins asynchronously.

### Request

```json
{
  "title": "Examination Form Submission Notice",
  "document_type": "NOTICE",
  "department_id": "uuid",
  "audience": {
    "roles": ["STUDENT"],
    "courses": ["B.Tech"],
    "semesters": [6]
  }
}
```

### Response

```json
{
  "data": {
    "document": {
      "id": "uuid",
      "status": "DRAFT",
      "title": "Examination Form Submission Notice"
    },
    "upload": {
      "upload_url": "https://storage.example/...",
      "expires_at": "2026-08-13T10:45:00Z"
    }
  }
}
```

---

## POST /documents/{document_id}/upload-complete

Signals successful object-storage upload.

### Response

```json
{
  "data": {
    "document_id": "uuid",
    "processing_status": "QUEUED"
  }
}
```

---

## GET /documents

Query parameters:

```text
search=
department_id=
document_type=
status=
academic_year=
course=
semester=
published_from=
published_to=
tag=
sort=
page=
limit=
```

### Response

```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Examination Form Submission Notice",
      "document_type": "NOTICE",
      "department": {
        "id": "uuid",
        "name": "Examination Cell"
      },
      "status": "PUBLISHED",
      "published_at": "2026-08-08T09:00:00Z",
      "summary": "Students must submit examination forms..."
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 132
  }
}
```

---

## GET /documents/{document_id}

Returns document detail.

---

## PATCH /documents/{document_id}

Edit metadata.

### Request

```json
{
  "title": "Updated Examination Form Notice",
  "tags": ["examination", "forms", "semester-6"]
}
```

---

## POST /documents/{document_id}/submit-review

Submit draft for approval.

---

## POST /documents/{document_id}/approve

Approve a document.

`APPROVER` or higher.

---

## POST /documents/{document_id}/publish

Publish a document.

---

## POST /documents/{document_id}/archive

Archive a document.

---

## POST /documents/{document_id}/supersede

Mark the current version/document as superseded by another document.

### Request

```json
{
  "superseded_by_document_id": "uuid",
  "reason": "New examination schedule replaces previous schedule."
}
```

---

## GET /documents/{document_id}/versions

Returns version history.

### Response

```json
{
  "data": [
    {
      "id": "uuid",
      "version_number": 3,
      "status": "CURRENT",
      "created_at": "2026-08-08T09:00:00Z"
    },
    {
      "id": "uuid",
      "version_number": 2,
      "status": "SUPERSEDED",
      "created_at": "2026-08-05T09:00:00Z"
    }
  ]
}
```

---

# 7. Search

## GET /search

Hybrid search endpoint.

### Query parameters

```text
q=notice about exam form late fee
department_id=
document_type=
date_from=
date_to=
academic_year=
course=
semester=
tags=
page=
limit=
```

### Response

```json
{
  "data": {
    "query": "notice about exam form late fee",
    "results": [
      {
        "document_id": "uuid",
        "title": "Examination Form Submission Notice",
        "score": 0.94,
        "summary": "Students must submit examination forms...",
        "match_reasons": [
          "exam form",
          "late fee"
        ],
        "published_at": "2026-08-08T09:00:00Z",
        "is_current": true
      }
    ],
    "facets": {
      "departments": [
        {
          "id": "uuid",
          "name": "Examination",
          "count": 8
        }
      ]
    }
  },
  "meta": {
    "total": 8,
    "latency_ms": 214
  }
}
```

---

## POST /search/feedback

Record search quality feedback.

### Request

```json
{
  "query": "exam form late fee",
  "document_id": "uuid",
  "feedback": "HELPFUL"
}
```

Allowed:
- `HELPFUL`
- `NOT_HELPFUL`
- `WRONG_RESULT`

---

## POST /search/unresolved

Save an unresolved query.

### Request

```json
{
  "query": "hostel application deadline for first year",
  "context": {
    "department_id": "uuid"
  }
}
```

Admin analytics can aggregate these queries.

---

# 8. AI / Ask Institution

## POST /ai/ask

Ask a source-grounded question.

### Request

```json
{
  "question": "When is the last date to submit the examination form?",
  "filters": {
    "department_id": "uuid"
  }
}
```

### Response

```json
{
  "data": {
    "answer": "The normal deadline for examination form submission is 18 August 2026.",
    "grounded": true,
    "confidence": "high",
    "citations": [
      {
        "document_id": "uuid",
        "document_title": "Examination Form Submission Notice",
        "version_id": "uuid",
        "page": 1
      }
    ]
  }
}
```

### Unsupported answer

```json
{
  "data": {
    "answer": "I couldn't find an official institutional document confirming this.",
    "grounded": false,
    "confidence": "low",
    "citations": []
  }
}
```

---

# 9. Bookmarks

## GET /bookmarks

## POST /bookmarks

### Request

```json
{
  "document_id": "uuid"
}
```

## DELETE /bookmarks/{document_id}

---

# 10. Important Dates

## GET /dates

Query:

```text
from=
to=
department_id=
course=
semester=
```

### Response

```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Examination Form Deadline",
      "date": "2026-08-18",
      "type": "DEADLINE",
      "source_document_id": "uuid"
    }
  ]
}
```

---

## POST /dates/{date_id}/feedback

Allows admins to correct extracted dates.

---

# 11. Notifications

## GET /notifications

## POST /notifications/{notification_id}/read

## POST /notifications/read-all

---

# 12. Admin Document Processing

## GET /admin/processing/jobs

Query:
- status
- type
- date range

### Response

```json
{
  "data": [
    {
      "id": "uuid",
      "document_id": "uuid",
      "job_type": "OCR",
      "status": "PROCESSING",
      "progress": 72
    }
  ]
}
```

---

# 13. Admin Analytics

## GET /admin/analytics/overview

Returns:
- published documents
- searches
- unique active users
- unresolved searches
- pending approvals

## GET /admin/analytics/searches

Query:
```text
from=
to=
department_id=
```

## GET /admin/analytics/popular-documents

## GET /admin/analytics/unresolved-searches

---

# 14. Audit Log

## GET /admin/audit-logs

Query:
```text
actor_id=
action=
entity_type=
from=
to=
page=
limit=
```

Admin-only.

---

# 15. Tags

## GET /tags

## POST /tags

```json
{
  "name": "Examination"
}
```

## PATCH /tags/{tag_id}

## DELETE /tags/{tag_id}

---

# 16. Users

## GET /admin/users

Query:
```text
search=
role=
department_id=
status=
page=
limit=
```

## PATCH /admin/users/{user_id}

Example:

```json
{
  "role": "DEPARTMENT_ADMIN",
  "department_id": "uuid"
}
```

---

# 17. API Authorization Matrix

| Endpoint Group | Student | Faculty | Dept Admin | Approver | Institution Admin |
|---|---:|---:|---:|---:|---:|
| Read published docs | ✅ | ✅ | ✅ | ✅ | ✅ |
| Search | ✅ | ✅ | ✅ | ✅ | ✅ |
| AI ask | ✅ | ✅ | ✅ | ✅ | ✅ |
| Bookmark | ✅ | ✅ | ✅ | ✅ | ✅ |
| Upload | ❌ | Optional | ✅ | ✅ | ✅ |
| Edit own draft | ❌ | Optional | ✅ | ✅ | ✅ |
| Approve | ❌ | ❌ | Optional | ✅ | ✅ |
| Publish | ❌ | ❌ | Optional | ✅ | ✅ |
| User management | ❌ | ❌ | ❌ | ❌ | ✅ |
| Audit logs | ❌ | ❌ | Optional | ✅ | ✅ |

Final permission behavior must also enforce document audience and department scope.

---

# 18. HTTP Status Codes

| Status | Meaning |
|---:|---|
| 200 | Successful read/update |
| 201 | Resource created |
| 202 | Accepted for async processing |
| 204 | Successful operation with no body |
| 400 | Invalid request |
| 401 | Authentication required |
| 403 | Permission denied |
| 404 | Resource not found |
| 409 | Conflict |
| 413 | File too large |
| 415 | Unsupported media type |
| 422 | Validation error |
| 429 | Rate limited |
| 500 | Internal server error |
| 503 | Service unavailable |

---

# 19. Idempotency

For:
- Publish
- Archive
- Approve
- Upload confirmation
- Notification dispatch

Support:

```http
Idempotency-Key: <unique-key>
```

Server should safely repeat the same request without producing duplicate side effects.

---

# 20. Webhooks / Events — Future

Potential event names:

```text
document.published
document.updated
document.superseded
document.archived
deadline.created
notification.sent
search.unresolved
```

Future use:
- Integrations.
- ERP sync.
- WhatsApp.
- External notification systems.

---

# 21. OpenAPI

The API should ultimately be described in OpenAPI 3.1.

Recommended repository structure:

```text
docs/
  api/
    openapi.yaml
    schemas/
    examples/
```

The OpenAPI document should become the source of truth for:
- API clients.
- SDK generation.
- API docs.
- Contract testing.

---

# 22. API Design Rule

> API responses should make the client capable of rendering the feature without reconstructing business logic from undocumented conventions.

The backend owns:
- Authorization.
- Ranking.
- Publication state.
- Version semantics.
- Audience logic.
- AI grounding.
- Auditability.
