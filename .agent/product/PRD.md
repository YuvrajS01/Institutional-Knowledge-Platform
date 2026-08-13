# Institutional Knowledge Platform — Product Requirements Document

**Product:** Institutional Knowledge Platform (working title)  
**Document:** Product Requirements Document  
**Version:** 1.0  
**Status:** Draft for MVP  
**Primary Launch Market:** Colleges / Universities  
**Last Updated:** 2026-08-13

---

## 1. Product Summary

The Institutional Knowledge Platform is a centralized, searchable system for organizational notices, circulars, PDFs, policies, forms, schedules, reports, and other official documents.

The initial product wedge is college notice/document management. The platform replaces fragmented information distribution across notice boards, WhatsApp groups, Telegram channels, websites, email, shared drives, and scattered PDFs with a single institutional source of truth.

The central differentiator is **meaning-based retrieval**:

> Users should be able to find an official document even when they do not remember its exact title, wording, or file name.

Example:

> “Find the notice from last month about exam form submission and late fee.”

The system combines conventional full-text search, metadata filters, semantic retrieval, OCR, document summaries, and source-grounded AI answers.

---

## 2. Problem Statement

Students, faculty, and staff regularly struggle to locate institutional information because:

- Documents are distributed across multiple channels.
- Notice titles are inconsistent and often not descriptive.
- PDFs may contain scanned images rather than searchable text.
- Users often remember the **meaning** of a notice rather than exact keywords.
- Old and new versions of a notice may coexist.
- Important dates are buried inside PDFs.
- There is no reliable way to know which version is current.
- Administrative teams repeatedly answer the same questions.
- Institutions have little visibility into what information users are unable to find.

### Core user problem

> “I know the institution published something about this, but I cannot find the exact notice.”

---

## 3. Product Vision

Create the default information layer for an institution:

> **Everything your institution knows. One searchable place.**

The long-term platform combines:

1. Document management
2. Institutional search
3. Knowledge discovery
4. Notifications and deadlines
5. Approval workflows
6. Source-grounded institutional AI
7. Analytics on information usage and gaps

---

## 4. Goals

### MVP Goals

- Centralize official institutional documents.
- Make documents searchable by keyword and meaning.
- Support scanned PDFs/images through OCR.
- Automatically extract useful metadata.
- Provide a clean, fast document reading experience.
- Allow authorized staff to publish and manage documents.
- Allow users to filter, sort, save, and share documents.
- Establish a trustworthy source-of-truth model.
- Capture search analytics and unresolved searches.

### Success Criteria

The first institution should be able to:

- Import its historical document archive.
- Publish new notices without technical assistance.
- Find a known document in under 10 seconds.
- Find vaguely remembered documents through semantic search.
- Identify the current version of a superseded notice.
- See upcoming dates extracted from important documents.

---

## 5. Non-Goals for MVP

The MVP will not attempt to:

- Replace a full college ERP.
- Replace student information systems.
- Handle attendance or marks.
- Process fee payments.
- Build a general-purpose chatbot.
- Become a generic file-storage product.
- Automatically publish documents without human approval.
- Make authoritative decisions on behalf of the institution.

---

## 6. Target Users

### 6.1 Student

Needs:
- Find notices quickly.
- Understand what a notice means.
- Know deadlines.
- Find notices relevant to their department/semester.
- Verify that a PDF is official.

Pain points:
- Information scattered across WhatsApp/groups/websites.
- Cannot remember exact notice title.
- Too many PDFs.

### 6.2 Faculty

Needs:
- Find policies, circulars, schedules, and department notices.
- Share official sources.
- Track current document versions.

### 6.3 Department Administrator

Needs:
- Upload and classify documents.
- Publish announcements.
- Control audience and visibility.
- Replace outdated documents.
- Review search gaps.

### 6.4 Institution Administrator

Needs:
- Configure departments, roles, and permissions.
- Approve documents.
- Manage users.
- Monitor usage.
- Audit publishing activity.

### 6.5 Super Admin / Platform Operator

Needs:
- Manage institutions.
- Monitor infrastructure.
- Enforce tenant isolation.
- Configure platform-level policies.

---

## 7. User Stories

### Students

- As a student, I want to search using natural language so I can find a notice even when I do not remember its exact wording.
- As a student, I want filters for department, document type, date, course, semester, and tags.
- As a student, I want a summary before opening a large PDF.
- As a student, I want to know when a document was published.
- As a student, I want to know whether a document has been superseded.
- As a student, I want to save frequently used documents.
- As a student, I want to receive notifications for relevant new notices.
- As a student, I want an answer with a link to the source document.

### Administrators

- As an administrator, I want to upload a PDF and have metadata extracted automatically.
- As an administrator, I want to edit extracted metadata before publishing.
- As an administrator, I want drafts to require approval before publication.
- As an administrator, I want to replace a document while preserving its history.
- As an administrator, I want to restrict a document to selected audiences.
- As an administrator, I want to see frequently searched terms with poor results.
- As an administrator, I want to archive documents without deleting the record.

---

## 8. Core Product Modules

### 8.1 Document Management

Capabilities:
- Upload PDF/image.
- Create document record.
- OCR.
- Extract text.
- Extract metadata.
- Tagging.
- Versioning.
- Publishing workflow.
- Archiving.
- Supersession.
- Document verification.

### 8.2 Search

Search modes:
- Exact/full-text search.
- Fuzzy search.
- Semantic/vector search.
- Natural-language query.
- Hybrid search combining lexical + semantic signals.

Filters:
- Department
- Document type
- Date range
- Academic year
- Course
- Semester
- Audience
- Tags
- Status

### 8.3 Document Viewer

- Embedded PDF viewer.
- Metadata.
- Summary.
- Important dates.
- Related documents.
- Version history.
- Verification status.
- Share/copy link.
- Download.

### 8.4 Feed

Personalized feed based on:
- Role
- Department
- Course
- Semester
- Audience
- Followed tags

### 8.5 Important Dates

Extract and surface:
- Deadlines
- Exam dates
- Registration dates
- Event dates
- Application windows

### 8.6 Notifications

Channels for MVP:
- In-app
- Email

Later:
- Push
- WhatsApp
- Telegram

### 8.7 Ask Institution

A source-grounded assistant that:
- Retrieves authoritative documents.
- Answers only from retrieved institutional sources.
- Cites sources.
- States uncertainty when evidence is insufficient.

### 8.8 Admin Console

- Document management.
- Approval queue.
- Users/roles.
- Departments.
- Taxonomies.
- Search analytics.
- Audit logs.
- Institution settings.

---

## 9. Functional Requirements

### FR-001 Tenant Isolation

Every resource must belong to an institution/tenant.

**Acceptance criteria**
- Users cannot access resources from another institution.
- Search only returns records from the active tenant.

### FR-002 Document Upload

Authorized users can upload supported files.

Initial formats:
- PDF
- PNG
- JPG/JPEG

Constraints:
- Maximum file size configurable per institution.
- Malware/security validation required.
- Duplicate detection recommended.

### FR-003 OCR

For scanned/image-based files:
- Extract text from pages.
- Preserve page references.
- Store OCR confidence where available.

### FR-004 Metadata Extraction

The ingestion pipeline should detect:
- Title
- Document type
- Department
- Publication date
- Effective date
- Important dates
- Academic year
- Course/semester
- Named entities
- Tags

All automatically extracted fields must remain editable by authorized users.

### FR-005 Publishing Workflow

Document states:

`DRAFT → IN_REVIEW → APPROVED → PUBLISHED → ARCHIVED`

Optional transition:

`PUBLISHED → SUPERSEDED`

### FR-006 Search

Search must support:
- Prefix and fuzzy matching.
- Full-text.
- Metadata.
- Semantic similarity.
- Hybrid ranking.

Search results must show why a result matched where feasible.

### FR-007 Natural Language Search

A query such as:

> “notice about late fee for exam form”

must retrieve semantically related documents even when exact words differ.

### FR-008 Search Results

Each result should contain:
- Title
- Document type
- Published date
- Department
- Relevant metadata
- Short summary
- Matching highlights
- Current-version indicator
- Link to source document

### FR-009 Document Versioning

Replacing a document must:
- Create a new version.
- Preserve the previous version.
- Maintain a relationship between versions.
- Mark obsolete/superseded versions.

### FR-010 Related Documents

System should recommend related documents using:
- Shared metadata
- Tags
- Semantic similarity
- Explicit administrator relationships

### FR-011 Bookmarks

Authenticated users can save documents.

### FR-012 Notifications

Users can receive notifications for:
- New relevant notice
- Updated notice
- Upcoming deadline
- Administrative announcement

### FR-013 Audit Log

Track:
- Upload
- Edit
- Submit for review
- Approve
- Publish
- Archive
- Replace
- Delete/restore
- Permission changes

### FR-014 AI Answers

Every answer must:
- Be grounded in retrieved institutional content.
- Reference one or more source documents.
- Prefer current, approved documents.
- State when no authoritative answer can be found.

### FR-015 Search Analytics

Record:
- Query
- Filters
- Timestamp
- Result count
- Selected result
- Zero-result search
- Optional answer feedback

Do not store unnecessary sensitive data.

---

## 10. Non-Functional Requirements

### Performance

Target:
- P95 standard search latency: < 500 ms excluding network.
- P95 semantic/hybrid search: < 1.5 s.
- Document page load: < 2 s for common cached content.
- AI answer generation: target < 8 s.

### Availability

MVP target:
- 99.5% monthly availability.

### Security

- TLS everywhere.
- Encryption at rest.
- Tenant-aware authorization.
- Role-based access control.
- Signed/private object URLs where needed.
- Audit logging.
- Malware scanning.
- Rate limiting.
- Secure secrets management.

### Privacy

- Minimize PII collection.
- Configurable data retention.
- Administrative export/delete capabilities.
- Clear separation of institution data.

### Accessibility

Target WCAG 2.1 AA principles:
- Keyboard navigation.
- Adequate contrast.
- Visible focus states.
- Screen-reader labels.
- Accessible forms and tables.

---

## 11. MVP Information Architecture

```text
Institution
├── Home
├── Search
├── Notices
├── Documents
├── Calendar
├── Saved
├── Notifications
└── Admin
    ├── Overview
    ├── Documents
    ├── Approvals
    ├── Users
    ├── Departments
    ├── Taxonomy
    ├── Analytics
    └── Audit Log
```

---

## 12. MVP Metrics

### Product metrics

- Weekly active users.
- Searches per active user.
- Search success rate.
- Zero-result search rate.
- Search-to-document-open rate.
- Time to first useful result.
- Documents published per institution.
- Percentage of documents with extracted text.
- Percentage of searches using natural language.
- Saved-document usage.

### Admin metrics

- Upload-to-publish time.
- Approval turnaround time.
- Most searched categories.
- Most viewed documents.
- Unresolved search volume.

### Quality metrics

- Search precision@5.
- Search success rate.
- OCR extraction success rate.
- AI answer citation accuracy.
- Hallucination/error reports.

---

## 13. Suggested MVP Milestones

### Phase 1 — Foundation

- Authentication
- Tenant model
- Roles
- Organization/departments
- Object storage
- PostgreSQL schema

### Phase 2 — Document Pipeline

- Upload
- Validation
- OCR
- Text extraction
- Metadata extraction
- Draft/review/publish flow

### Phase 3 — Search

- Full-text search
- Filters
- Semantic embeddings
- Hybrid ranking
- Result page

### Phase 4 — Consumption

- Document viewer
- Summaries
- Bookmarks
- Related documents
- Important dates

### Phase 5 — Admin + Analytics

- Dashboard
- Approval queue
- Search analytics
- Audit log

### Phase 6 — Institutional AI

- Retrieval-augmented answers
- Source citations
- Feedback

---

## 14. Risks

### AI hallucination

Mitigation:
- RAG only over approved institution content.
- Citation-required answers.
- Refuse to answer without evidence.

### Poor metadata quality

Mitigation:
- Automatic extraction plus manual review.
- Strong taxonomy.
- Admin-editable metadata.

### Search fails to understand vague queries

Mitigation:
- Hybrid search.
- Query rewriting.
- Synonym dictionary.
- Evaluation benchmark using real institutional queries.

### Information becomes stale

Mitigation:
- Versioning.
- Supersession.
- Effective dates.
- Prefer latest approved document in ranking.

### Administrators resist workflow change

Mitigation:
- Extremely fast upload flow.
- Bulk import.
- Email-to-document/drive connectors later.
- Minimal required metadata.

---

## 15. Future Opportunities

- WhatsApp ingestion.
- Email ingestion.
- Google Drive/OneDrive connectors.
- University ERP integrations.
- Mobile apps/PWA.
- SSO.
- Digital signatures.
- Public verification portal.
- Institution-wide knowledge graph.
- AI-generated FAQs from authoritative content.
- Multi-language search.
- Hindi/English multilingual OCR and retrieval.
- Government department deployments.
- On-premise/private-cloud deployment.

---

## 16. Product Principle

> **The platform should never make finding official information harder than finding the original document.**

Search can be intelligent, but the authoritative source must always remain visible.
