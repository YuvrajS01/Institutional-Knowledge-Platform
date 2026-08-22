# Evals — Mock vs Real Provider

This directory contains retrieval and RAG evaluation for the search-first platform.

## Deterministic (mock) evals — always run in CI

- `search-evaluation.test.ts` + `rag-evaluation.test.ts` use **mock providers**:
  - `MockEmbeddingProvider` (`@ikp/processing`) — deterministic SHA-256 hash, 1024 dims, L2 normalized.
  - `MockLLMProvider` — canned grounded answers for `examination|hostel|cse|…` and canonical unsupported sentence otherwise.
  - `MockRerankerProvider` — token-overlap heuristic.
- Purpose: regression gate for ranking, permission-aware retrieval, citation validation, unsupported handling.
- Thresholds are **mock-only** (see files: `Recall@5 ≥0.4`, `MRR ≥0.3`, `RAG overall ≥0.6`). These do **not** claim production-grade quality.

CI runs these on every PR (`DATABASE_URL_TEST=...:5432`, pgvector, no external model required).

## Real-provider evals — gated, require local/cloud models

- `search-evaluation.real.test.ts` + `rag-evaluation.real.test.ts` are **skipped by default**.
- Enable with:

  ```bash
  EVAL_REAL=1 pnpm test -- tests/evals/search-evaluation.real.test.ts tests/evals/rag-evaluation.real.test.ts
  # or via helper scripts:
  pnpm test:eval           # mock only (CI)
  pnpm test:eval:real      # real (requires providers)
  ```

- What they do:
  - `search-evaluation.real.test.ts` uses `HybridSearchService` with a **real** `EmbeddingProvider` (`LocalEmbeddingProvider` via `EMBEDDING_PROVIDER=local` or `OPENAI`/`VLLM`, `EMBEDDING_BASE_URL`, `EMBEDDING_MODEL=bge-m3`).
  - `rag-evaluation.real.test.ts` uses `RagAnswerService` with real LLM (`LocalLLMProvider` via `LLM_PROVIDER=local`, `LLM_BASE_URL`, `LLM_MODEL=qwen2:7b` or cloud).
  - Both seed the same 12-case dataset but call the remote model for embeddings/answers, so scores reflect real model quality.

- Requirements:

  | Var | Example | Notes |
  |---|---|---|
  | `EVAL_REAL=1` | `1` | Gate flag — without it, real tests are skipped (not failed). |
  | `EMBEDDING_PROVIDER` | `local` | Use `createEmbeddingProvider()` factory; `mock` is ignored in real mode. |
  | `EMBEDDING_BASE_URL` | `http://localhost:11434` | Ollama default; for vLLM use `http://localhost:8000/v1`. |
  | `EMBEDDING_MODEL` | `bge-m3` | Must match `vector(1024)` dim. |
  | `LLM_PROVIDER` | `local` | For RAG real eval. |
  | `LLM_BASE_URL` | `http://localhost:11434` | Ollama `qwen2:7b` or `vLLM`. |
  | `DATABASE_URL` | `postgresql://...:5434/...` | Test DB with `vector` extension. |
  | Ollama models | `ollama pull bge-m3 && ollama pull qwen2:7b` | Or equivalent. |

- How failure is reported:
  - If `EVAL_REAL=1` but providers are unreachable (fetch fails / timeout), the test **fails with a clear message** instructing to start Ollama or unset `EVAL_REAL`.
  - Production thresholds are stricter: `Recall@5 ≥0.6`, `RAG citation ≥0.8`. Do **not** promote to production without a real-model artifact (see `.agent/ai/AI_EVALUATION.md`).

## Files

| File | Provider | Gate |
|---|---|---|
| `search-evaluation.test.ts` | mock | always |
| `rag-evaluation.test.ts` | mock | always |
| `search-evaluation.real.test.ts` | real (local/openai) | `EVAL_REAL=1` |
| `rag-evaluation.real.test.ts` | real (local/openai) | `EVAL_REAL=1` |
| `search-evaluation.runner.ts` | shared | — |
| `rag-evaluation.runner.ts` | shared | — |
| `search-evaluation.dataset.json` | — | 12 cases |
| `rag-evaluation.dataset.json` | — | 12 cases |

## Policy (from MVP_REVIEW P0-C04)

> Do not claim production-grade AI quality from mock evals. Keep mock for determinism; gate real evals behind `EVAL_REAL`.
