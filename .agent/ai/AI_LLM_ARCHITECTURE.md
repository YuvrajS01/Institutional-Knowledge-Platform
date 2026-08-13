# Institutional Knowledge Platform — AI & LLM Architecture

**Document:** AI/LLM Architecture Specification  
**Version:** 1.0  
**Status:** MVP / Production Planning  
**Date:** 2026-08-13

---

## 1. Purpose

This document defines the AI architecture for the Institutional Knowledge Platform, including:

- OCR
- Document understanding
- Metadata extraction
- Embeddings
- Semantic search
- Reranking
- Retrieval-Augmented Generation (RAG)
- Institutional AI
- Model serving
- Self-hosted deployment
- Cloud AI fallback
- AI provider abstraction
- Model evaluation

The architecture is intentionally **model-provider agnostic** so that the platform can run entirely on institutional infrastructure or use external AI APIs when appropriate.

---

# 2. Core Principle

The platform does **not** need one large LLM for everything.

Different AI tasks should use different models:

```text
                    DOCUMENT
                       │
                       ▼
                 OCR / Parsing
                       │
                       ▼
              Document Understanding
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
        Metadata              Summary
        Extraction
             │
             ▼
          Chunking
             │
             ▼
        Embedding Model
             │
             ▼
       Vector / Search Index
             │
             ▼
          Retrieval
             │
             ▼
          Reranker
             │
             ▼
            LLM
             │
             ▼
       Answer + Citations
```

This reduces cost, improves latency, and makes the system easier to operate.

---

# 3. AI Components

The platform should initially have six AI/model components.

| Component | Primary purpose | Self-hostable |
|---|---|---:|
| OCR | Extract text from scanned documents | Yes |
| Embedding model | Semantic search | Yes |
| Small LLM | Classification/extraction/summaries | Yes |
| Reranker | Improve search relevance | Yes |
| Main LLM | Institutional Q&A/RAG | Yes |
| Optional cloud LLM | Quality/fallback | Yes, external |

---

# 4. Recommended MVP Stack

## OCR

**Primary:** PaddleOCR

Alternative:
- Tesseract

## Embeddings

**Primary:** BGE-M3

Alternative:
- multilingual-e5
- newer multilingual embedding models as benchmarks justify them

## LLM

Initial candidates:
- Qwen 7B/8B class
- Qwen 14B class
- Llama/Gemma/Mistral equivalents

## Reranker

Candidate:
- BGE reranker family

## Vector database

**PostgreSQL + pgvector**

## Model serving

Development:
- Ollama

Production:
- vLLM

---

# 5. Why Multilingual Models Matter

The initial target market includes Indian institutions.

Users may search in:

- English
- Hindi
- Hinglish
- Transliteration

Examples:

```text
"exam form last date"

"exam form ka last date kya hai"

"परीक्षा फॉर्म जमा करने की अंतिम तिथि"

"exam registration kab tak hai"
```

These queries should ideally retrieve the same institutional documents.

Therefore, multilingual embeddings should be prioritized from the beginning.

---

# 6. OCR Architecture

Institutional archives frequently contain scanned PDFs.

The ingestion system should determine whether OCR is required.

```text
PDF
 │
 ▼
Native text extraction
 │
 ├── sufficient text
 │       │
 │       ▼
 │     Continue
 │
 └── insufficient text
         │
         ▼
       OCR
         │
         ▼
     Extracted text
```

## Requirements

Store:

- Original document.
- Extracted text.
- OCR output.
- Page numbers.
- OCR confidence where available.
- OCR provider/version.

The original file must never be modified.

---

# 7. Embedding Architecture

An embedding model converts text into vectors.

Example:

```text
"last date for examination form"
```

and:

```text
"students must submit their examination forms before 18 August"
```

should produce vectors that are semantically close.

## Document embedding flow

```text
Document
   │
   ▼
Text extraction
   │
   ▼
Chunking
   │
   ▼
Embedding model
   │
   ▼
Vector
   │
   ▼
pgvector
```

## Query flow

```text
User query
   │
   ▼
Embedding model
   │
   ▼
Query vector
   │
   ▼
Vector similarity search
```

---

# 8. Chunking

Documents should not normally be embedded as one giant block.

Recommended initial configuration:

- 300–700 tokens per chunk.
- 10–20% overlap.
- Preserve page number.
- Preserve document/version IDs.
- Prefer semantic boundaries.

Chunk boundaries should favor:

- Headings.
- Paragraphs.
- Lists.
- Tables.
- Sections.

Example:

```text
Document
 ├── Page 1
 │    ├── Chunk 1
 │    └── Chunk 2
 ├── Page 2
 │    ├── Chunk 3
 │    └── Chunk 4
 └── Page 3
      └── Chunk 5
```

---

# 9. Hybrid Search

Semantic search alone is not sufficient.

The platform should combine:

### Lexical search

Useful for:

- Notice numbers.
- Exact names.
- Dates.
- Unique terms.
- Department names.

### Semantic search

Useful for:

- Vague memories.
- Natural-language queries.
- Synonyms.
- Paraphrases.
- Multilingual queries.

### Hybrid architecture

```text
                 USER QUERY
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
    Full-text Search      Vector Search
          │                     │
          └──────────┬──────────┘
                     ▼
               Candidate Merge
                     │
                     ▼
                  Reranker
                     │
                     ▼
                 Top Results
```

---

# 10. Reranking

Initial retrieval may return 20–100 candidates.

A reranker can evaluate the query against each candidate and produce a better ranking.

```text
Query
  │
  ▼
Hybrid retrieval
  │
  ▼
Top 50 candidates
  │
  ▼
Reranker
  │
  ▼
Top 5–10
```

This is especially useful when many notices share similar terminology.

---

# 11. Search Ranking

A conceptual ranking function:

```text
Final Score =
    lexical_weight × lexical_score
  + semantic_weight × semantic_score
  + metadata_weight × metadata_score
  + freshness_weight × freshness_score
  + authority_weight × authority_score
```

The exact weights should be determined through evaluation rather than hard-coded assumptions.

## Authority signals

Prefer:

1. Published documents.
2. Approved documents.
3. Current versions.
4. Documents from authoritative departments.

Penalize:

- Drafts.
- Archived documents.
- Superseded versions.

---

# 12. Small LLM Tasks

A smaller LLM can perform:

- Document classification.
- Title extraction.
- Department prediction.
- Tag generation.
- Audience detection.
- Important-date extraction.
- Entity extraction.
- Short summaries.

Example:

```text
OCR text
   │
   ▼
Small LLM
   │
   ├── title
   ├── type
   ├── department
   ├── audience
   ├── tags
   ├── dates
   └── summary
```

These outputs should be treated as **proposals**, not unquestionable truth.

Administrators should be able to review and modify them.

---

# 13. Main Institutional LLM

The main LLM handles user-facing questions such as:

> "When is the last date to submit the exam form?"

or:

> "What documents do I need before graduation?"

The LLM should not be expected to memorize institutional information.

Instead, use RAG.

---

# 14. RAG Architecture

```text
User question
      │
      ▼
Query normalization
      │
      ▼
Hybrid retrieval
      │
      ▼
Relevant chunks
      │
      ▼
Reranking
      │
      ▼
Context selection
      │
      ▼
LLM
      │
      ▼
Answer
      │
      ▼
Citations
```

---

# 15. Source-Grounded AI

This is a core product requirement.

The AI must prefer:

> "According to the Examination Cell notice published on 8 August 2026, the deadline is 18 August 2026."

instead of:

> "I think the deadline is 18 August."

If sufficient evidence cannot be retrieved:

> "I couldn't find an official institutional document confirming this."

This behavior should be enforced through both retrieval and application logic.

---

# 16. AI Response Contract

The model/service should return structured output.

```json
{
  "answer": "The examination form deadline is 18 August 2026.",
  "grounded": true,
  "confidence": "high",
  "citations": [
    {
      "document_id": "uuid",
      "version_id": "uuid",
      "page": 1
    }
  ]
}
```

The application, not the LLM, should ultimately decide whether a response is allowed to be shown as authoritative.

---

# 17. Citation Requirements

Every factual institutional answer should provide:

- Document title.
- Document ID.
- Version.
- Page number where possible.
- Link to the source document.

Example:

```text
Answer:
The deadline is 18 August 2026.

Source:
Examination Form Submission Notice
Published: 08 Aug 2026
Page: 1

[Open source]
```

---

# 18. Model Selection

The platform should support configurable model providers.

Example abstraction:

```typescript
interface LLMProvider {
  generate(request: GenerateRequest): Promise<GenerateResponse>;
}
```

Providers can include:

```text
LLMProvider
 ├── OllamaProvider
 ├── VLLMProvider
 ├── OpenAIProvider
 ├── AnthropicProvider
 ├── GeminiProvider
 └── CustomProvider
```

Similarly:

```typescript
interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}
```

This prevents application code from becoming tied to a single AI vendor.

---

# 19. Self-Hosted Architecture

A fully self-hosted installation can run:

```text
                 INSTITUTION SERVER
┌─────────────────────────────────────────────┐
│                                             │
│ Frontend                                    │
│ React / Next.js                             │
│       │                                     │
│       ▼                                     │
│ API Server                                  │
│       │                                     │
│ ┌─────┼─────────────┐                       │
│ ▼     ▼             ▼                       │
│ DB   Storage       Queue                    │
│ │                                             │
│ ▼                                             │
│ pgvector                                      │
│ │                                             │
│ ├── Embedding model                           │
│ ├── Reranker                                  │
│ └── LLM inference server                     │
│                                             │
│ OCR workers                                  │
│                                             │
└─────────────────────────────────────────────┘
```

Nothing needs to leave the institution.

---

# 20. Development vs Production Model Serving

## Development

Use:

**Ollama**

Advantages:
- Easy setup.
- Easy model switching.
- Excellent for local development.
- Simple API.

Example architecture:

```text
Node.js API
    │
    ▼
 Ollama
    │
    ▼
 Qwen
```

## Production

Use:

**vLLM**

Advantages:
- Efficient inference.
- Continuous batching.
- Better GPU utilization.
- Better concurrent request handling.
- OpenAI-compatible API interface.

Example:

```text
API
 │
 ▼
Load Balancer
 │
 ├── vLLM GPU 1
 ├── vLLM GPU 2
 └── vLLM GPU 3
```

---

# 21. Hardware Strategy

Exact hardware requirements depend heavily on:

- Model size.
- Quantization.
- Context length.
- Concurrent users.
- Tokens/second requirement.
- GPU type.

Therefore hardware should be selected after benchmarking the chosen model.

## General strategy

### Development

CPU or consumer GPU.

### Small institution

One modest GPU inference server can be sufficient.

### Medium deployment

Dedicated GPU inference server with batching.

### Large deployment

Multiple inference replicas behind a load balancer.

---

# 22. Quantization

Quantization should be considered for self-hosting.

Instead of running a model at full precision:

```text
Full precision
     ↓
High memory
```

use a quantized version:

```text
Quantized model
     ↓
Lower memory
     ↓
More accessible hardware
```

Common formats/ecosystems include:

- GGUF
- AWQ
- GPTQ

The best format depends on the serving stack.

---

# 23. Cost Optimization

Do not invoke an LLM for ordinary search.

### Bad architecture

```text
Every search
    ↓
LLM
```

### Recommended

```text
Every search
    ↓
Full-text + vector search
    ↓
Results
```

Only invoke the LLM for:

- Ask Institution.
- Complex summarization.
- Document extraction.
- Advanced query interpretation where required.

---

# 24. AI Request Routing

A model router can select models based on task.

```text
                AI Request
                    │
                    ▼
                 Router
          ┌─────────┼─────────┐
          ▼         ▼         ▼
      Embedding   Small LLM   Main LLM
          │         │           │
       Search    Metadata      RAG
```

Example:

```text
Search query
→ embedding model

Document classification
→ small LLM

Document summary
→ small LLM

Complex institutional question
→ main LLM
```

---

# 25. Hybrid Cloud Architecture

The platform can support:

### Cloud mode

```text
Platform
   │
   └── Cloud AI
```

### Private AI mode

```text
Institution
   │
   └── Private LLM
```

### Fully on-premise

```text
Institution Network
   ├── API
   ├── Database
   ├── Storage
   ├── OCR
   ├── Embeddings
   └── LLM
```

This allows the same software product to serve different customers.

---

# 26. Recommended Provider Abstraction

Application code should never directly depend on one model provider.

Example:

```typescript
interface AIService {
  classifyDocument(input: DocumentInput): Promise<Classification>;
  summarizeDocument(input: DocumentInput): Promise<Summary>;
  answerQuestion(input: QuestionInput): Promise<GroundedAnswer>;
}

interface EmbeddingService {
  embed(texts: string[]): Promise<number[][]>;
}

interface RerankerService {
  rerank(
    query: string,
    documents: SearchCandidate[]
  ): Promise<SearchCandidate[]>;
}
```

This allows:

```text
Self-hosted
   │
   ├── Ollama
   ├── vLLM
   └── Local OCR

Cloud
   │
   ├── External LLM
   ├── External embeddings
   └── External OCR
```

without changing the product layer.

---

# 27. AI Security

Institutional documents can contain sensitive information.

Requirements:

- Tenant isolation.
- Access-controlled retrieval.
- No cross-institution retrieval.
- No unauthorized document exposure through RAG.
- Audit AI queries.
- Avoid sending restricted documents to external providers unless explicitly permitted.
- Do not train external models on institutional data unless contractually and technically guaranteed.
- Encrypt stored embeddings where appropriate.
- Protect inference endpoints.

---

# 28. RAG Permission Boundary

This is critical.

Do not retrieve all documents and filter them after the LLM has seen them.

Correct:

```text
User
 ↓
Authorization
 ↓
Eligible document set
 ↓
Search
 ↓
Rerank
 ↓
LLM
```

Incorrect:

```text
User
 ↓
Search entire institution
 ↓
LLM sees restricted documents
 ↓
Filter answer
```

The second design can leak information.

---

# 29. Model Evaluation

The platform should maintain a real evaluation dataset.

Each test case should contain:

```json
{
  "query": "What is the last date for examination form submission?",
  "expected_documents": [
    "document-uuid"
  ],
  "expected_answer": "18 August 2026"
}
```

Evaluate:

### Retrieval

- Recall@5
- Recall@10
- MRR
- NDCG

### AI answers

- Citation correctness.
- Groundedness.
- Answer correctness.
- Unsupported claim rate.
- Refusal accuracy.

### Operational

- Latency.
- Throughput.
- GPU utilization.
- Cost/request.

---

# 30. AI Quality Principle

Search quality should be measured separately from LLM quality.

A large LLM cannot compensate for poor retrieval.

```text
Poor Retrieval
      +
Great LLM
      =
Confident Wrong Answer
```

Whereas:

```text
Great Retrieval
      +
Good LLM
      =
Reliable Institutional AI
```

Therefore retrieval engineering should be treated as a first-class product capability.

---

# 31. Recommended Initial Model Strategy

For the first prototype:

```text
OCR
└── PaddleOCR

Embeddings
└── BGE-M3

Vector Search
└── PostgreSQL + pgvector

Reranker
└── BGE reranker family

Small LLM
└── Qwen 7B/8B-class

Main LLM
└── Qwen 7B/8B or 14B-class

Development Serving
└── Ollama

Production Serving
└── vLLM
```

These are **starting candidates**, not permanent dependencies. Benchmark current model releases before production selection.

---

# 32. Recommended Development Sequence

### Stage 1

Build document ingestion without an LLM:

```text
PDF → Text → PostgreSQL
```

### Stage 2

Add embeddings:

```text
PDF → Text → Chunks → Embeddings → pgvector
```

### Stage 3

Build hybrid search:

```text
Keyword + Semantic Search
```

### Stage 4

Add reranking:

```text
Hybrid Search → Reranker
```

### Stage 5

Add document intelligence:

```text
OCR → Metadata → Summary
```

### Stage 6

Add RAG:

```text
Question → Retrieval → LLM → Citation
```

### Stage 7

Evaluate with real institutional data.

Only after this should you decide whether a larger model is actually necessary.

---

# 33. Long-Term AI Architecture

The mature platform could become:

```text
                         USER
                           │
                           ▼
                    Query Understanding
                           │
                           ▼
                 ┌─────────────────────┐
                 │ Permission-Aware    │
                 │ Retrieval           │
                 └──────────┬──────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
          Keyword        Semantic       Metadata
          Search         Search         Search
              │             │             │
              └─────────────┼─────────────┘
                            ▼
                         Reranker
                            │
                            ▼
                    Knowledge Context
                            │
                            ▼
                      Institutional LLM
                            │
                ┌───────────┴───────────┐
                ▼                       ▼
             Answer                  Sources
                │                       │
                └───────────┬───────────┘
                            ▼
                     User Interface
```

---

# 34. Final Recommendation

The platform should be designed as an **AI-provider-neutral institutional knowledge system**, not as an application built around a particular LLM.

For the initial implementation, prioritize:

1. **High-quality OCR**
2. **Multilingual embeddings**
3. **Excellent hybrid search**
4. **Permission-aware retrieval**
5. **Strong document/version semantics**
6. **Source-grounded RAG**
7. **Small, efficient models for routine tasks**
8. **A larger model only where it provides measurable value**

The most important architectural decision is:

> **The LLM is the reasoning layer, not the database.**

Institutional truth lives in the documents and structured metadata. The retrieval layer finds that truth, and the LLM turns it into a useful answer while preserving the source.

---

# 35. Reference AI Stack

```text
┌──────────────────────────────────────────────────────┐
│                  Institutional AI                    │
├──────────────────────────────────────────────────────┤
│                                                      │
│ UI / API                                             │
│       │                                              │
│       ▼                                              │
│ Query Router                                         │
│       │                                              │
│       ├──────────────► Embedding Model               │
│       │                       │                      │
│       │                       ▼                      │
│       │                 pgvector                     │
│       │                       │                      │
│       │                 Hybrid Search                │
│       │                       │                      │
│       │                   Reranker                   │
│       │                       │                      │
│       └───────────────────────┤                      │
│                               ▼                      │
│                         Context Builder              │
│                               │                      │
│                               ▼                      │
│                             LLM                      │
│                               │                      │
│                               ▼                      │
│                      Answer + Citations              │
│                                                      │
├──────────────────────────────────────────────────────┤
│ Document Pipeline                                    │
│                                                      │
│ PDF/Image → OCR → Extraction → Metadata → Chunking  │
│                                      │               │
│                                      ▼               │
│                                  Embeddings           │
│                                                      │
└──────────────────────────────────────────────────────┘
```
