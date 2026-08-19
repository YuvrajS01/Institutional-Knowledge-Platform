import { z } from 'zod';

// Re-define document types locally to avoid a runtime dependency on @ikp/shared
// during early development; keep the list in sync with packages/shared/src/domain.ts.
export const METADATA_DOCUMENT_TYPES = [
  'NOTICE',
  'CIRCULAR',
  'POLICY',
  'FORM',
  'SCHEDULE',
  'REPORT',
  'OTHER',
] as const;

export type MetadataDocumentType = (typeof METADATA_DOCUMENT_TYPES)[number];

export interface MetadataExtractionInput {
  text: string;
  /** Original filename without storage key, used for title fallback. */
  filename?: string | null;
  mimeType?: string | null;
  institutionId?: string | null;
}

export interface MetadataExtractionResult {
  title: string | null;
  documentType: MetadataDocumentType | null;
  summary: string | null;
  tags: string[];
  academicYear: string | null;
  course: string | null;
  semester: number | null;
  /** Audience hint extracted from text (roles/courses/semesters). */
  audience: Record<string, unknown> | null;
  entities: Record<string, unknown> | null;
  language: string | null;
  /** Confidence 0..1 */
  confidence: number;
  /** Provider name, e.g. "heuristic" or "llm". */
  provider: string;
}

export const metadataExtractionResultSchema = z.object({
  title: z.string().nullable(),
  documentType: z.enum(METADATA_DOCUMENT_TYPES).nullable(),
  summary: z.string().nullable(),
  tags: z.array(z.string()),
  academicYear: z.string().nullable(),
  course: z.string().nullable(),
  semester: z.number().int().positive().nullable(),
  audience: z.record(z.string(), z.unknown()).nullable(),
  entities: z.record(z.string(), z.unknown()).nullable(),
  language: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  provider: z.string().min(1),
});

/**
 * Provider-agnostic metadata extraction (TECHNICAL_SPEC §8, AI_LLM_ARCHITECTURE §12).
 *
 * Deterministic/heuristic and LLM-assisted implementations share this contract
 * so the processing pipeline can swap providers without changing callers
 * (ADR-003 provider abstraction, ADR-007 local-first).
 */
export interface MetadataExtractor {
  name(): string;
  extract(input: MetadataExtractionInput): Promise<MetadataExtractionResult>;
}
