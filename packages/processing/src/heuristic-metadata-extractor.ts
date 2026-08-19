import {
  type MetadataDocumentType,
  type MetadataExtractionInput,
  type MetadataExtractionResult,
  type MetadataExtractor,
  metadataExtractionResultSchema,
} from './metadata.js';

const KNOWN_TAGS = [
  'examination',
  'exam',
  'admission',
  'registration',
  'fee',
  'deadline',
  'circular',
  'notice',
  'policy',
  'schedule',
  'form',
  'result',
  'holiday',
  'hostel',
  'library',
  'department',
  'semester',
  'course',
  'timetable',
  'scholarship',
  'placement',
  'internship',
  'workshop',
  'seminar',
] as const;

const COURSE_KEYWORDS = [
  'BTECH',
  'MTECH',
  'BCA',
  'MCA',
  'MBA',
  'BSC',
  'MSC',
  'BA',
  'MA',
  'BCOM',
  'MCOM',
  'LLB',
  'LLM',
  'PHD',
  'DIPLOMA',
] as const;

const TYPE_KEYWORDS: Array<{ type: MetadataDocumentType; keywords: string[] }> = [
  { type: 'CIRCULAR', keywords: ['circular'] },
  { type: 'POLICY', keywords: ['policy'] },
  { type: 'FORM', keywords: ['form', 'application'] },
  { type: 'SCHEDULE', keywords: ['schedule', 'timetable', 'calendar'] },
  { type: 'REPORT', keywords: ['report', 'minutes'] },
  { type: 'NOTICE', keywords: ['notice', 'notification'] },
];

const ACADEMIC_YEAR_REGEX = /\b(20\d{2})\s*[-/]\s*(20\d{2}|\d{2})\b/;
const SEMESTER_REGEX = /\b(?:semester|sem)\s*[-:]?\s*(\d{1,2})\b/i;
const COURSE_REGEX = new RegExp(`\\b(${COURSE_KEYWORDS.join('|')})\\b`, 'i');
const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'are',
  'with',
  'this',
  'that',
  'from',
  'have',
  'has',
  'will',
  'shall',
  'should',
  'must',
  'been',
  'were',
  'was',
  'are',
  'not',
  'its',
  'our',
  'your',
]);

function extractTitle(text: string, filename?: string | null): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length > 0) {
    const first = lines[0]!;
    // Heuristic: title is first non-empty line, capped at 200 chars.
    return first.length > 200 ? `${first.slice(0, 200).trimEnd()}…` : first;
  }
  if (filename) {
    // Fallback: humanize filename (remove extension, replace delimiters).
    const base = filename
      .replace(/\.[^/.]+$/, '')
      .replace(/[-_]+/g, ' ')
      .trim();
    return base.length > 0 ? base : null;
  }
  return null;
}

function classifyDocumentType(text: string): MetadataDocumentType | null {
  const lowered = text.toLowerCase();
  for (const entry of TYPE_KEYWORDS) {
    if (entry.keywords.some((kw) => lowered.includes(kw))) {
      return entry.type;
    }
  }
  if (text.trim().length === 0) {
    return null;
  }
  return 'OTHER';
}

function extractSummary(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  // Split on sentence boundaries (. ! ?) followed by whitespace.
  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  if (sentences.length >= 2) {
    const summary = sentences.slice(0, 2).join(' ').trim();
    return summary.length > 500 ? `${summary.slice(0, 500).trimEnd()}…` : summary;
  }
  // Fallback: first 300 chars.
  const fallback = trimmed.slice(0, 300).trim();
  return fallback.length === 0 ? null : fallback;
}

function extractTags(text: string): string[] {
  const lowered = text.toLowerCase();
  const found: string[] = [];
  for (const tag of KNOWN_TAGS) {
    if (lowered.includes(tag)) {
      found.push(tag);
    }
  }
  // Supplement with frequent non-stopword tokens if we have too few tags.
  if (found.length < 3) {
    const tokens = lowered.split(/[^a-z0-9]+/g).filter((t) => t.length >= 4 && !STOPWORDS.has(t));
    const freq = new Map<string, number>();
    for (const t of tokens) {
      freq.set(t, (freq.get(t) ?? 0) + 1);
    }
    const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    for (const tok of sorted) {
      if (found.length >= 10) break;
      if (!found.includes(tok)) {
        found.push(tok);
      }
    }
  }
  return [...new Set(found)].slice(0, 10);
}

function extractAcademicYear(text: string): string | null {
  const m = text.match(ACADEMIC_YEAR_REGEX);
  if (!m) {
    return null;
  }
  // Normalize: expand 2-digit suffix to 4 digits when needed.
  const start = m[1]!;
  const rawEnd = m[2]!;
  if (rawEnd.length === 2) {
    const century = start.slice(0, 2);
    return `${start}-${century}${rawEnd}`;
  }
  if (start === rawEnd) {
    return null;
  }
  return `${start}-${rawEnd}`;
}

function extractCourse(text: string): string | null {
  const m = text.match(COURSE_REGEX);
  return m?.[1]?.toUpperCase() ?? null;
}

function extractSemester(text: string): number | null {
  const m = text.match(SEMESTER_REGEX);
  if (!m) {
    return null;
  }
  const n = Number.parseInt(m[1]!, 10);
  if (!Number.isFinite(n) || n < 1 || n > 12) {
    return null;
  }
  return n;
}

function detectLanguage(text: string): string | null {
  if (!text.trim()) {
    return null;
  }
  // Devanagari block indicates Hindi.
  if (/[\u0900-\u097F]/.test(text)) {
    return 'hin';
  }
  return 'eng';
}

function confidenceFor(text: string, hasTitle: boolean): number {
  if (!text.trim()) {
    return 0.1;
  }
  if (text.trim().length < 50) {
    return 0.3;
  }
  if (hasTitle) {
    return 0.55;
  }
  return 0.45;
}

/**
 * Heuristic (deterministic) metadata extractor — local-first baseline
 * (TECHNICAL_SPEC §8 deterministic tier, ADR-007).
 *
 * Suitable for local dev, tests, and as a fallback when an LLM provider is
 * unavailable. All AI-assisted fields remain proposals: the admin UI stays
 * editable before publication (PRD FR-004).
 */
export class HeuristicMetadataExtractor implements MetadataExtractor {
  name(): string {
    return 'heuristic';
  }

  async extract(input: MetadataExtractionInput): Promise<MetadataExtractionResult> {
    const text = input.text ?? '';

    const title = extractTitle(text, input.filename ?? null);
    const documentType = classifyDocumentType(text);
    const summary = extractSummary(text);
    const tags = extractTags(text);
    const academicYear = extractAcademicYear(text);
    const course = extractCourse(text);
    const semester = extractSemester(text);
    const language = detectLanguage(text);
    const confidence = confidenceFor(text, title !== null);

    const result: MetadataExtractionResult = {
      title,
      documentType,
      summary,
      tags,
      academicYear,
      course,
      semester,
      audience: null,
      entities: null,
      language,
      confidence,
      provider: this.name(),
    };

    // Validate against schema so callers and tests get a hard guarantee.
    metadataExtractionResultSchema.parse(result);
    return result;
  }
}

export function createMetadataExtractor(): MetadataExtractor {
  return new HeuristicMetadataExtractor();
}
