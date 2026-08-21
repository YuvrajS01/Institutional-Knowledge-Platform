# Task Manifest

Status values:

- `TODO`
- `IN_PROGRESS`
- `BLOCKED`
- `DONE`
- `DEFERRED`

Priority:

- `P0` critical path
- `P1` MVP
- `P2` post-MVP

The agent should execute the highest-priority unblocked task in dependency order.

---

## Phase 0 — Foundation

| ID | Pri | Status | Task | Depends On |
|---|---|---|---|---|
| P0-001 | P0 | DONE | Initialize repository structure | — |
| P0-002 | P0 | DONE | Configure TypeScript strict mode | P0-001 |
| P0-003 | P0 | DONE | Configure lint/format/test tooling | P0-001 |
| P0-004 | P0 | DONE | Add environment validation and `.env.example` | P0-001 |
| P0-005 | P0 | DONE | Add Docker Compose for PostgreSQL/pgvector/Redis/local storage | P0-001 |
| P0-006 | P0 | DONE | Add CI pipeline | P0-003 |
| P0-007 | P0 | DONE | Add base application shells for web/API/worker | P0-001 |
| P0-008 | P0 | DONE | Add health/readiness endpoints | P0-007 |

## Phase 1 — Identity

| ID | Pri | Status | Task | Depends On |
|---|---|---|---|---|
| P1-001 | P0 | DONE | Create institutions migration | P0-005 |
| P1-002 | P0 | DONE | Create users/memberships migration | P1-001 |
| P1-003 | P0 | DONE | Create departments migration | P1-001 |
| P1-004 | P0 | DONE | Implement authentication | P1-002 |
| P1-005 | P0 | DONE | Implement RBAC | P1-004 |
| P1-006 | P0 | DONE | Implement tenant-aware repository helpers | P1-002 |
| P1-007 | P0 | DONE | Add cross-tenant security tests | P1-005,P1-006 |
| P1-008 | P1 | DONE | Build institution/department admin UI | P1-005 |

## Phase 2 — Documents

| ID | Pri | Status | Task | Depends On |
|---|---|---|---|---|
| P2-001 | P0 | DONE | Create document/document-version schema | P1-006 |
| P2-002 | P0 | DONE | Add object storage abstraction | P0-004 |
| P2-003 | P0 | DONE | Implement signed upload flow | P2-001,P2-002 |
| P2-004 | P0 | DONE | Implement document CRUD service | P2-001 |
| P2-005 | P0 | DONE | Implement lifecycle state machine | P2-004 |
| P2-006 | P0 | DONE | Implement audit logging | P2-004 |
| P2-007 | P1 | DONE | Build admin document list | P2-004,P1-008 |
| P2-008 | P1 | DONE | Build upload/review UI shell | P2-003 |

## Phase 3 — Processing

| ID | Pri | Status | Task | Depends On |
|---|---|---|---|---|
| P3-001 | P0 | DONE | Add job queue abstraction | P0-005 |
| P3-002 | P0 | DONE | Implement PDF text extraction adapter | P3-001 |
| P3-003 | P0 | DONE | Implement OCR adapter | P3-001 |
| P3-004 | P0 | DONE | Implement processing orchestration | P3-002,P3-003 |
| P3-005 | P0 | DONE | Implement metadata extraction interface | P3-004 |
| P3-006 | P1 | DONE | Implement metadata extraction provider | P3-005 |
| P3-007 | P1 | DONE | Implement date extraction | P3-006 |
| P3-008 | P0 | DONE | Implement chunking | P3-004 |
| P3-009 | P1 | DONE | Add processing retry/status UI | P3-004,P2-008 |
| P3-010 | P1 | DONE | Add scanned-PDF integration tests | P3-003,P3-004 |

## Phase 4 — Publishing

| ID | Pri | Status | Task | Depends On |
|---|---|---|---|---|
| P4-001 | P0 | DONE | Implement review queue API | P2-005 |
| P4-002 | P0 | DONE | Implement approve/publish APIs | P4-001 |
| P4-003 | P0 | DONE | Implement supersession/version APIs | P2-001,P2-005 |
| P4-004 | P1 | DONE | Build approval queue UI | P4-001 |
| P4-005 | P1 | DONE | Build version history UI | P4-003 |
| P4-006 | P0 | DONE | Add publication permission tests | P4-002,P1-007 |

## Phase 5 — Search

| ID | Pri | Status | Task | Depends On |
|---|---|---|---|---|
| P5-001 | P0 | DONE | Add document chunk storage schema | P3-008 |
| P5-002 | P0 | DONE | Add embedding provider interface | P5-001 |
| P5-003 | P0 | DONE | Add local embedding adapter | P5-002 |
| P5-004 | P0 | DONE | Generate/store embeddings | P5-003 |
| P5-005 | P0 | DONE | Implement PostgreSQL full-text search | P2-001 |
| P5-006 | P0 | DONE | Implement vector search | P5-004 |
| P5-007 | P0 | DONE | Implement hybrid retrieval | P5-005,P5-006 |
| P5-008 | P1 | DONE | Implement reranker interface/adapter | P5-007 |
| P5-009 | P0 | DONE | Implement search API | P5-007 |
| P5-010 | P0 | DONE | Build search results UI | P5-009 |
| P5-011 | P1 | DONE | Add filters/facets | P5-009 |
| P5-012 | P1 | TODO | Add search analytics | P5-009 |
| P5-013 | P1 | TODO | Add unresolved-search workflow | P5-012 |
| P5-014 | P0 | DONE | Build search evaluation set | P5-007 |

## Phase 6 — Consumption

| ID | Pri | Status | Task | Depends On |
|---|---|---|---|---|
| P6-001 | P0 | DONE | Build document detail API | P2-004,P4-003 |
| P6-002 | P0 | DONE | Build document detail page | P6-001 |
| P6-003 | P1 | DONE | Add document summary display | P3-006,P6-002 |
| P6-004 | P1 | DONE | Add important dates API/UI | P3-007 |
| P6-005 | P1 | DONE | Add bookmarks | P6-001 |
| P6-006 | P1 | TODO | Add related documents | P5-008,P6-001 |
| P6-007 | P1 | TODO | Add share links | P6-001 |

## Phase 7 — Notifications

| ID | Pri | Status | Task | Depends On |
|---|---|---|---|---|
| P7-001 | P1 | TODO | Create notification schema | P1-002 |
| P7-002 | P1 | TODO | Implement notification service | P7-001 |
| P7-003 | P1 | TODO | Implement in-app notifications | P7-002 |
| P7-004 | P1 | TODO | Implement email adapter | P7-002 |
| P7-005 | P1 | TODO | Add relevance rules | P7-002,P1-005 |
| P7-006 | P1 | TODO | Add deadline reminder jobs | P7-005,P3-007 |

## Phase 8 — Institutional AI

| ID | Pri | Status | Task | Depends On |
|---|---|---|---|---|
| P8-001 | P0 | DONE | Create LLM provider interface | P0-007 |
| P8-002 | P0 | DONE | Create local LLM adapter | P8-001 |
| P8-003 | P1 | TODO | Create cloud LLM adapter | P8-001 |
| P8-004 | P0 | DONE | Implement permission-aware retrieval service | P5-007,P1-005 |
| P8-005 | P0 | DONE | Implement context builder | P8-004 |
| P8-006 | P0 | DONE | Implement RAG answer service | P8-002,P8-005 |
| P8-007 | P0 | DONE | Implement citation contract | P8-006 |
| P8-008 | P0 | DONE | Implement unsupported-answer behavior | P8-006 |
| P8-009 | P0 | DONE | Implement `/ai/ask` API | P8-006,P8-007 |
| P8-010 | P0 | DONE | Build Ask Institution UI | P8-009 |
| P8-011 | P0 | DONE | Add prompt-injection tests | P8-006 |
| P8-012 | P0 | DONE | Add RAG evaluation dataset | P8-006 |
| P8-013 | P0 | DONE | Add cross-tenant RAG tests | P8-004,P8-009 |

## Phase 9 — Hardening

| ID | Pri | Status | Task | Depends On |
|---|---|---|---|---|
| P9-001 | P0 | DONE | Full E2E critical-path suite | P6-002,P8-010 |
| P9-002 | P0 | DONE | Full security regression suite | P1-007,P4-006,P8-013 |
| P9-003 | P1 | TODO | Load-test search | P5-009 |
| P9-004 | P1 | TODO | Load-test async processing | P3-004 |
| P9-005 | P1 | TODO | Add metrics/tracing | P0-008 |
| P9-006 | P1 | TODO | Validate backup/restore | P1-001,P2-002 |
| P9-007 | P1 | TODO | Production deployment automation | P9-005 |
| P9-008 | P0 | DONE | Run MVP final gate | ALL_P0 |


### Git Traceability

For each meaningful task, use the task ID to connect planning and history:

```text
Task ID → branch → commit → PR → merge
```

Recommended branch format:

```text
feat/<TASK-ID>-<short-name>
```

The task manifest remains the planning source of truth; Git remains the implementation/history source of truth.
