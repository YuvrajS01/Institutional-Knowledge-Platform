import { z } from 'zod';

export const IMPORTANT_DATE_TYPES = [
  'DEADLINE',
  'EXAM',
  'REGISTRATION',
  'SUBMISSION',
  'HOLIDAY',
  'EVENT',
  'OTHER',
] as const;

export type ImportantDateType = (typeof IMPORTANT_DATE_TYPES)[number];

export interface ImportantDate {
  /** Original matched text, e.g. "18 August 2026" */
  raw: string;
  /** Normalized ISO date YYYY-MM-DD or null if ambiguous */
  isoDate: string | null;
  /** Label inferred from surrounding context, e.g. "deadline", "exam form" */
  label: string | null;
  /** Broad type classification */
  type: ImportantDateType | null;
  /** Sentence/context where the date appeared */
  context: string | null;
  /** Confidence 0..1 */
  confidence: number;
}

export interface DateExtractionInput {
  text: string;
  filename?: string | null;
  mimeType?: string | null;
}

export interface DateExtractionResult {
  dates: ImportantDate[];
  /** Provider name, e.g. "heuristic" or "llm:qwen2:7b" */
  provider: string;
  /** Overall confidence 0..1 */
  confidence: number;
}

export const importantDateSchema = z.object({
  raw: z.string().min(1),
  isoDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  label: z.string().nullable(),
  type: z.enum(IMPORTANT_DATE_TYPES).nullable(),
  context: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export const dateExtractionResultSchema = z.object({
  dates: z.array(importantDateSchema),
  provider: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

/**
 * Provider-agnostic date extraction (TECHNICAL_SPEC §8 deterministic + AI-assisted,
 * AI_LLM_ARCHITECTURE §12 Small LLM Tasks, PRD FR-004/FR-005).
 *
 * Deterministic (regex) and LLM-assisted implementations share this contract
 * so the pipeline can swap providers without changing callers
 * (ADR-003 provider abstraction, ADR-007 local-first).
 */
export interface DateExtractor {
  name(): string;
  extract(input: DateExtractionInput): Promise<DateExtractionResult>;
}
