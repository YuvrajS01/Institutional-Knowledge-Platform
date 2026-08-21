import {
  METADATA_DOCUMENT_TYPES,
  type MetadataDocumentType,
  type MetadataExtractionInput,
  type MetadataExtractionResult,
  type MetadataExtractor,
  metadataExtractionResultSchema,
} from './metadata.js';
import type { LLMProvider } from './llm.js';
import { createLLMProvider } from './mock-llm-provider.js';
import { HeuristicMetadataExtractor } from './heuristic-metadata-extractor.js';

const SYSTEM_PROMPT = `You are a metadata extraction assistant for institutional documents.
Extract structured metadata from the given document text and return ONLY valid JSON.

Rules:
- Return a single JSON object, no markdown, no explanation.
- Fields:
  - title: string|null — the document title (first meaningful heading or subject). Trim to 200 chars. Null if not determinable.
  - documentType: one of ["NOTICE","CIRCULAR","POLICY","FORM","SCHEDULE","REPORT","OTHER"] or null
  - summary: string|null — concise 1-2 sentence summary, max 500 chars. Null if text is empty.
  - tags: string[] — 3-10 lowercase keywords relevant to the document (e.g., examination, hostel, deadline). Empty array if none.
  - academicYear: string|null — academic year like "2023-2024" if present, else null
  - course: string|null — course code like "BTECH","MCA" uppercase if present, else null
  - semester: number|null — integer 1-12 if mentioned (e.g., "semester 3"), else null
  - audience: object|null — always null for now
  - entities: object|null — always null for now
  - language: string|null — "eng" for English, "hin" for Hindi (Devanagari), null if empty
  - confidence: number 0..1 — your confidence in the extraction
  - provider: string — must be "llm"

Example output:
{"title":"Examination Form Submission Notice","documentType":"NOTICE","summary":"Students must submit examination forms before 18 August 2026. Late fee applies after deadline.","tags":["examination","deadline","fee"],"academicYear":"2023-2024","course":"BTECH","semester":3,"audience":null,"entities":null,"language":"eng","confidence":0.85,"provider":"llm"}
`;

const MAX_TEXT_CHARS = 4000;

export interface LlmMetadataExtractorOptions {
  llmProvider?: LLMProvider;
  fallback?: MetadataExtractor;
  maxTextChars?: number;
  temperature?: number;
  maxTokens?: number;
}

function truncateText(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars).trimEnd()}…[truncated]`;
}

function extractJsonObject(raw: string): string | null {
  const text = raw.trim();
  // Strip markdown fences like ```json ... ```
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch ? fenceMatch[1]!.trim() : text;

  // Find first { and last } to isolate JSON object
  const first = candidate.indexOf('{');
  const last = candidate.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  const jsonStr = candidate.slice(first, last + 1);
  return jsonStr;
}

function normalizeResult(parsed: Record<string, unknown>, modelName: string): MetadataExtractionResult {
  // Coerce and default fields to satisfy schema, mirroring heuristic behavior
  const rawType = typeof parsed.documentType === 'string' ? (parsed.documentType as string).toUpperCase() : null;
  const documentType: MetadataDocumentType | null =
    rawType && (METADATA_DOCUMENT_TYPES as readonly string[]).includes(rawType)
      ? (rawType as MetadataDocumentType)
      : null;

  const tags = Array.isArray(parsed.tags)
    ? (parsed.tags as unknown[]).filter((t): t is string => typeof t === 'string').map((t) => t.toLowerCase().trim()).filter(Boolean).slice(0, 10)
    : [];

  const semesterRaw = parsed.semester;
  let semester: number | null = null;
  if (typeof semesterRaw === 'number' && Number.isInteger(semesterRaw) && semesterRaw >= 1 && semesterRaw <= 12) {
    semester = semesterRaw;
  } else if (typeof semesterRaw === 'string') {
    const n = Number.parseInt(semesterRaw, 10);
    if (Number.isInteger(n) && n >= 1 && n <= 12) semester = n;
  }

  const academicYear = typeof parsed.academicYear === 'string' && parsed.academicYear.trim() ? parsed.academicYear.trim() : null;
  const course = typeof parsed.course === 'string' && parsed.course.trim() ? parsed.course.trim().toUpperCase() : null;

  const title = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim().slice(0, 200) : null;
  const summary = typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim().slice(0, 500) : null;

  // Language detection fallback if LLM didn't populate
  let language: string | null = null;
  if (typeof parsed.language === 'string' && parsed.language.trim()) {
    language = parsed.language.trim().toLowerCase().slice(0, 10);
  }

  let confidence = typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence) ? parsed.confidence : 0.5;
  confidence = Math.max(0, Math.min(1, confidence));

  const result: MetadataExtractionResult = {
    title: title ?? null,
    documentType: documentType ?? null,
    summary: summary ?? null,
    tags,
    academicYear,
    course,
    semester,
    audience: parsed.audience && typeof parsed.audience === 'object' ? (parsed.audience as Record<string, unknown>) : null,
    entities: parsed.entities && typeof parsed.entities === 'object' ? (parsed.entities as Record<string, unknown>) : null,
    language,
    confidence,
    provider: 'llm',
  };

  // Validate strictly; let caller handle fallback
  metadataExtractionResultSchema.parse(result);
  // Preserve model info in provider field? Keep "llm" per schema but caller may want modelName
  void modelName;
  return result;
}

/**
 * LLM-backed metadata extractor (P3-006).
 *
 * Uses an `LLMProvider` (Ollama / vLLM / OpenAI-compatible via `LocalLLMProvider`,
 * or `MockLLMProvider` for tests) to extract structured metadata as JSON.
 *
 * Design mirrors `LocalEmbeddingProvider` / `LocalLLMProvider`:
 * - provider-agnostic via `LLMProvider` interface (ADR-003/007)
 * - deterministic heuristic fallback when LLM output is invalid or unavailable
 * - strict Zod validation before returning (IMPLEMENTATION_GUIDE §7)
 * - treats empty text via heuristic filename fallback without invoking LLM
 */
export class LlmMetadataExtractor implements MetadataExtractor {
  private readonly llmProvider: LLMProvider;
  private readonly fallback: MetadataExtractor;
  private readonly maxTextChars: number;
  private readonly temperature: number;
  private readonly maxTokens: number | undefined;

  constructor(options: LlmMetadataExtractorOptions = {}) {
    this.llmProvider = options.llmProvider ?? createLLMProvider();
    this.fallback = options.fallback ?? new HeuristicMetadataExtractor();
    this.maxTextChars = options.maxTextChars ?? MAX_TEXT_CHARS;
    this.temperature = options.temperature ?? 0;
    this.maxTokens = options.maxTokens ?? 800;
  }

  name(): string {
    return `llm:${this.llmProvider.modelName()}`;
  }

  async extract(input: MetadataExtractionInput): Promise<MetadataExtractionResult> {
    const text = input.text ?? '';

    // Empty/whitespace text: avoid LLM call, delegate to heuristic (which handles filename fallback)
    if (!text.trim()) {
      const fallbackResult = await this.fallback.extract(input);
      // Re-tag as llm provider only if fallback was heuristic and we want to indicate delegation?
      // Keep fallback's own provider but ensure schema valid; caller sees "heuristic" confidence low
      // For transparency, return fallback directly (it already has provider "heuristic" and low confidence)
      return fallbackResult;
    }

    const truncated = truncateText(text, this.maxTextChars);
    const prompt = buildPrompt(truncated, input.filename ?? null, input.mimeType ?? null);

    let rawText: string;
    try {
      const response = await this.llmProvider.generate({
        prompt,
        systemPrompt: SYSTEM_PROMPT,
        temperature: this.temperature,
        maxTokens: this.maxTokens,
      });
      rawText = response.text;
    } catch {
      // LLM unavailable/timeout -> fallback to heuristic
      return this.fallback.extract(input);
    }

    if (!rawText || !rawText.trim()) {
      return this.fallback.extract(input);
    }

    const jsonStr = extractJsonObject(rawText);
    if (!jsonStr) {
      return this.fallback.extract(input);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    } catch {
      return this.fallback.extract(input);
    }

    try {
      const normalized = normalizeResult(parsed, this.llmProvider.modelName());
      // If language is null but text indicates Hindi, patch via heuristic detection
      if (!normalized.language) {
        const heuristicLang = await this.fallback.extract({ text: truncated });
        normalized.language = heuristicLang.language;
      }
      return normalized;
    } catch {
      return this.fallback.extract(input);
    }
  }
}

function buildPrompt(text: string, filename: string | null, mimeType: string | null): string {
  const parts: string[] = [];
  parts.push('Extract metadata from the following institutional document.');
  if (filename) parts.push(`Filename: ${filename}`);
  if (mimeType) parts.push(`MIME type: ${mimeType}`);
  parts.push('');
  parts.push('--- DOCUMENT TEXT ---');
  parts.push(text);
  parts.push('--- END DOCUMENT TEXT ---');
  parts.push('');
  parts.push('Return ONLY the JSON object described in the system prompt.');
  return parts.join('\n');
}

export function createLlmMetadataExtractor(options?: LlmMetadataExtractorOptions): MetadataExtractor {
  return new LlmMetadataExtractor(options);
}
