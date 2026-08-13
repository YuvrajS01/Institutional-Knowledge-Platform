# Agent Documentation File Map

| Directory | Purpose |
|---|---|
| `.agent/product/` | Product requirements and scope |
| `.agent/design/` | UI/UX design |
| `.agent/architecture/` | Technical architecture and ADRs |
| `.agent/ai/` | AI/LLM architecture and evaluation |
| `.agent/api/` | API contracts |
| `.agent/planning/` | Autonomous execution plan, task manifest and current project state |
| `.agent/engineering/` | Development, Git and completion policy |
| `.agent/quality/` | Tests and security |
| `.agent/operations/` | Environment and operational assumptions |

## Agent Reading Order

```text
AGENTS.md
    ↓
INSTRUCTIONS.md
    ↓
.agent/AGENTS.md
    ↓
.agent/INSTRUCTIONS.md
    ↓
.agent/planning/PHASE_PLAN.md
    ↓
.agent/planning/TASK_MANIFEST.md
    ↓
task-specific documents
```
