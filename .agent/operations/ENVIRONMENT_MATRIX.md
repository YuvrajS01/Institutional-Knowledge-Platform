# Environment Matrix

| Capability | Local | Test | Staging | Production |
|---|---|---|---|---|
| Database | Docker PostgreSQL | Isolated DB | Managed | Managed/HA |
| pgvector | Yes | Yes | Yes | Yes |
| Object storage | Local/S3-compatible | Isolated bucket | Dedicated bucket | Dedicated bucket |
| Queue | Redis | Redis | Managed Redis | Managed Redis/Queue |
| OCR | Local adapter | Local adapter | Configurable | Configurable |
| Embeddings | Local | Local | Local/cloud | Configurable |
| LLM | Ollama | Mock/local | vLLM/cloud | vLLM/cloud/private |
| Email | Mailpit | Mailpit | Test provider | Real provider |
| Analytics | Local | Local | Enabled | Enabled |
| Monitoring | Basic logs | Logs | Metrics | Full observability |

## Rules

- Never use production credentials locally.
- Never load production documents into development.
- Never point tests at production databases.
- Keep model configuration environment-driven.
- Keep provider credentials out of source control.
- Production secrets come from a secrets manager or deployment secret store.
