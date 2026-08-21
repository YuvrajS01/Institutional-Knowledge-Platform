import {
  type DateExtractionInput,
  type DateExtractionResult,
  type DateExtractor,
  type ImportantDate,
  dateExtractionResultSchema,
  IMPORTANT_DATE_TYPES,
} from './dates.js';
import type { LLMProvider } from './llm.js';
import { createLLMProvider } from './mock-llm-provider.js';
import { HeuristicDateExtractor } from './heuristic-date-extractor.js';

const SYSTEM_PROMPT = `You are a date extraction assistant for institutional documents.
Extract all important dates from the given document text and return ONLY valid JSON.

Rules:
- Return a single JSON object, no markdown, no explanation.
- Fields:
  - dates: array of objects, each with:
    - raw: string — original date text as it appears (e.g., "18 August 2026")
    - isoDate: string|null — normalized YYYY-MM-DD (e.g., "2026-08-18"), null if ambiguous
    - label: string|null — short label from context (e.g., "deadline", "exam", "registration"), null if none
    - type: one of ["DEADLINE","EXAM","REGISTRATION","SUBMISSION","HOLIDAY","EVENT","OTHER"] or null
    - context: string|null — the sentence containing the date, or null
    - confidence: number 0..1
  - provider: string — must be "llm"
  - confidence: number 0..1 — overall confidence

Example:
{"dates":[{"raw":"18 August 2026","isoDate":"2026-08-18","label":"deadline","type":"DEADLINE","context":"Submit by 18 August 2026.","confidence":0.9}],"provider":"llm","confidence":0.9}

If no dates are found, return {"dates":[],"provider":"llm","confidence":0.2}
For Hindi dates, still normalize to isoDate if possible.
`;

const MAX_TEXT_CHARS = 4000;

export interface LlmDateExtractorOptions {
  llmProvider?: LLMProvider;
  fallback?: DateExtractor;
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
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch ? fenceMatch[1]!.trim() : text;
  const first = candidate.indexOf('{');
  const last = candidate.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  return candidate.slice(first, last + 1);
}

function normalizeResult(parsed: Record<string, unknown>, modelName: string): DateExtractionResult {
  const datesRaw = Array.isArray(parsed.dates) ? parsed.dates : [];
  const dates: ImportantDate[] = datesRaw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const obj = entry as Record<string, unknown>;
      const raw = typeof obj.raw === 'string' && obj.raw.trim() ? obj.raw.trim() : null;
      if (!raw) return null;
      const isoDate =
        typeof obj.isoDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.isoDate.trim())
          ? obj.isoDate.trim()
          : null;
      const label = typeof obj.label === 'string' && obj.label.trim() ? obj.label.trim().toLowerCase().slice(0, 50) : null;
      const typeRaw = typeof obj.type === 'string' ? obj.type.trim().toUpperCase() : null;
      const type =
        typeRaw && (IMPORTANT_DATE_TYPES as readonly string[]).includes(typeRaw)
          ? (typeRaw as ImportantDate['type'])
          : null;
      const context = typeof obj.context === 'string' && obj.context.trim() ? obj.context.trim().slice(0, 500) : null;
      let confidence = typeof obj.confidence === 'number' && Number.isFinite(obj.confidence) ? obj.confidence : 0.6;
      confidence = Math.max(0, Math.min(1, confidence));
      const date: ImportantDate = { raw, isoDate, label, type, context, confidence };
      return date;
    })
    .filter((d): d is ImportantDate => d !== null)
    .slice(0, 20); // cap at 20 dates

  let overall = typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence) ? parsed.confidence : 0.5;
  overall = Math.max(0, Math.min(1, overall));
  if (dates.length === 0) overall = Math.min(overall, 0.3);

  const result: DateExtractionResult = {
    dates,
    provider: 'llm',
    confidence: overall,
  };
  dateExtractionResultSchema.parse(result);
  void modelName;
  return result;
}

/**
 * LLM-backed date extractor (P3-007).
 *
 * Mirrors LlmMetadataExtractor: provider-agnostic via LLMProvider,
 * heuristic fallback on invalid/timeout, Zod validation, empty-text bypass.
 */
export class LlmDateExtractor implements DateExtractor {
  private readonly llmProvider: LLMProvider;
  private readonly fallback: DateExtractor;
  private readonly maxTextChars: number;
  private readonly temperature: number;
  private readonly maxTokens: number | undefined;

  constructor(options: LlmDateExtractorOptions = {}) {
    this.llmProvider = options.llmProvider ?? createLLMProvider();
    this.fallback = options.fallback ?? new HeuristicDateExtractor();
    this.maxTextChars = options.maxTextChars ?? MAX_TEXT_CHARS;
    this.temperature = options.temperature ?? 0;
    this.maxTokens = options.maxTokens ?? 800;
  }

  name(): string {
    return `llm:${this.llmProvider.modelName()}`;
  }

  async extract(input: DateExtractionInput): Promise<DateExtractionResult> {
    const text = input.text ?? '';
    if (!text.trim()) {
      const fallbackResult = await this.fallback.extract(input);
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
      return normalizeResult(parsed, this.llmProvider.modelName());
    } catch {
      return this.fallback.extract(input);
    }
  }
}

function buildPrompt(text: string, filename: string | null, mimeType: string | null): string {
  const parts: string[] = [];
  parts.push('Extract important dates from the following institutional document.');
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

export function createLlmDateExtractor(options?: LlmDateExtractorOptions): DateExtractor {
  return new LlmDateExtractor(options);
}
