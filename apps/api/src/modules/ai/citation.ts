import { z } from 'zod';

/**
 * Citation contract (P8-007) — source-grounded institutional AI.
 *
 * Spec refs:
 * - AI_LLM_ARCHITECTURE §16 Response Contract `{answer, grounded, confidence, citations: [{document_id, version_id, page}]}`
 * - AI_LLM_ARCHITECTURE §17 Citation Requirements (title, id, version, page, link)
 * - API_SPEC_SHEET §8 `POST /ai/ask` → citations `[{document_id, document_title, version_id, page}]`
 * - AGENTS.md §11.4 Citations
 *
 * Backend owns version semantics, tenant scope, and grounding. Citation must
 * correspond to a permission-aware retrieval result (P8-004) — never hallucinated.
 */

export const UNSUPPORTED_ANSWER =
  "I couldn't find an official institutional document confirming this." as const;

export const citationSchema = z.object({
  document_id: z.string().uuid(),
  document_title: z.string().min(1),
  version_id: z.string().uuid(),
  page: z.number().int().min(1).nullable(),
  // Internal convenience — not required by API spec but preserved for
  // page-building and chunk-level provenance. Stripped in API response if needed.
  chunk_id: z.string().uuid().optional(),
  // Legacy aliases for backward compat with P8-005/006 (title/page_number)
  title: z.string().min(1).optional(),
  page_number: z.number().int().min(1).nullable().optional(),
});

export type Citation = z.infer<typeof citationSchema>;

/**
 * API-shaped citation (exactly what /ai/ask returns).
 * Keeps only spec-required fields.
 */
export type ApiCitation = Pick<Citation, 'document_id' | 'document_title' | 'version_id' | 'page'>;

export function toApiCitation(c: Citation): ApiCitation {
  return {
    document_id: c.document_id,
    document_title: c.document_title,
    version_id: c.version_id,
    page: c.page,
  };
}

/**
 * Validate a single citation against the contract. Throws ZodError on violation.
 */
export function assertValidCitation(c: unknown): asserts c is Citation {
  citationSchema.parse(c);
}

/**
 * Validate an array of citations.
 */
export function assertValidCitations(citations: unknown[]): asserts citations is Citation[] {
  z.array(citationSchema).parse(citations);
}

/**
 * Extract citation indices referenced in LLM text as `[n]` markers.
 * Returns 1-based indices that exist within `citationCount`.
 */
export function extractCitedIndices(text: string, citationCount: number): number[] {
  const pattern = /\[(\d+)\]/g;
  const indices = new Set<number>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const idx = Number(match[1]);
    if (Number.isFinite(idx) && idx >= 1 && idx <= citationCount) {
      indices.add(idx);
    }
  }
  return Array.from(indices).sort((a, b) => a - b);
}

/**
 * Filter citations to only those cited in text. If text contains no valid
 * markers but is grounded, caller decides whether to return all or none.
 */
export function filterCitationsByIndices(citations: Citation[], indices: number[]): Citation[] {
  if (indices.length === 0) return [];
  return indices.map((i) => citations[i - 1]!).filter(Boolean);
}

/**
 * Check whether text is the canonical unsupported answer.
 */
export function isUnsupportedAnswer(text: string): boolean {
  return text.trim() === UNSUPPORTED_ANSWER || text.includes(UNSUPPORTED_ANSWER);
}

/**
 * Build the canonical unsupported RagAnswer shape. Used by P8-008.
 */
export function unsupportedAnswer(): {
  answer: string;
  grounded: false;
  confidence: 'low';
  citations: [];
} {
  return {
    answer: UNSUPPORTED_ANSWER,
    grounded: false as const,
    confidence: 'low' as const,
    citations: [],
  };
}
