import {
  type DateExtractionInput,
  type DateExtractionResult,
  type DateExtractor,
  type ImportantDate,
  type ImportantDateType,
  dateExtractionResultSchema,
} from './dates.js';

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sept: 9,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const MONTH_NAMES = Object.keys(MONTHS).join('|');

// Regexes ordered by specificity
// 1. "18 August 2026" / "18th August, 2026" / "August 18, 2026"
const MONTH_DAY_YEAR_1 = new RegExp(
  `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAMES})\\b[\\s,]+(20\\d{2})\\b`,
  'gi',
);
const MONTH_DAY_YEAR_2 = new RegExp(
  `\\b(${MONTH_NAMES})\\s+(\\d{1,2})(?:st|nd|rd|th)?[\\s,]+(20\\d{2})\\b`,
  'gi',
);
// 2. ISO "2026-08-18"
const ISO_DATE = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g;
// 3. D/M/Y "18/08/2026" "18-08-2026" "18.08.2026"
const DMY_SLASH = /\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/g;

const LABEL_KEYWORDS: Array<{ keywords: string[]; label: string; type: ImportantDateType }> = [
  { keywords: ['deadline', 'last date', 'closing date', 'due date'], label: 'deadline', type: 'DEADLINE' },
  { keywords: ['exam', 'examination', 'test', 'paper'], label: 'exam', type: 'EXAM' },
  { keywords: ['registration', 'register', 'enroll'], label: 'registration', type: 'REGISTRATION' },
  { keywords: ['submission', 'submit', 'form'], label: 'submission', type: 'SUBMISSION' },
  { keywords: ['holiday', 'vacation', 'leave'], label: 'holiday', type: 'HOLIDAY' },
  { keywords: ['event', 'workshop', 'seminar', 'fest'], label: 'event', type: 'EVENT' },
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isValidDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toIso(y: number, m: number, d: number): string | null {
  if (!isValidDate(y, m, d)) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function extractSentence(text: string, matchIndex: number, matchLength: number): string | null {
  // Find sentence boundaries around match
  const start = text.lastIndexOf('.', matchIndex);
  const sentenceStart = start === -1 ? 0 : start + 1;
  const endDot = text.indexOf('.', matchIndex + matchLength);
  const endExcl = text.indexOf('!', matchIndex + matchLength);
  const endQuest = text.indexOf('?', matchIndex + matchLength);
  let sentenceEnd = text.length;
  for (const cand of [endDot, endExcl, endQuest]) {
    if (cand !== -1 && cand < sentenceEnd) sentenceEnd = cand + 1;
  }
  const sentence = text.slice(sentenceStart, sentenceEnd).trim();
  if (sentence.length > 500) return sentence.slice(0, 500).trimEnd() + '…';
  return sentence || null;
}

function inferLabelAndType(context: string | null, surrounding: string): { label: string | null; type: ImportantDateType | null; confidenceBoost: number } {
  const lower = `${context ?? ''} ${surrounding}`.toLowerCase();
  for (const entry of LABEL_KEYWORDS) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) {
        return { label: kw, type: entry.type, confidenceBoost: 0.15 };
      }
    }
  }
  return { label: null, type: null, confidenceBoost: 0 };
}

function confidenceFor(raw: string, isoDate: string | null, hasLabel: boolean): number {
  if (!isoDate) return 0.3;
  if (hasLabel) return 0.85;
  // Short raw like "18/08/2026" is less confident than "18 August 2026"
  if (raw.includes('/')) return 0.6;
  return 0.75;
}

interface RawMatch {
  raw: string;
  isoDate: string | null;
  index: number;
  length: number;
}

function findMatches(text: string): RawMatch[] {
  const matches: RawMatch[] = [];
  const seen = new Set<string>(); // dedup by raw+index

  function push(raw: string, iso: string | null, index: number) {
    const key = `${index}:${raw}`;
    if (seen.has(key)) return;
    seen.add(key);
    matches.push({ raw: raw.trim(), isoDate: iso, index, length: raw.length });
  }

  // 1. Month day year variants
  let m: RegExpExecArray | null;
  MONTH_DAY_YEAR_1.lastIndex = 0;
  while ((m = MONTH_DAY_YEAR_1.exec(text)) !== null) {
    const day = Number.parseInt(m[1]!, 10);
    const monthStr = m[2]!.toLowerCase();
    const year = Number.parseInt(m[3]!, 10);
    const month = MONTHS[monthStr]!;
    const iso = toIso(year, month, day);
    push(m[0], iso, m.index);
  }

  MONTH_DAY_YEAR_2.lastIndex = 0;
  while ((m = MONTH_DAY_YEAR_2.exec(text)) !== null) {
    const monthStr = m[1]!.toLowerCase();
    const day = Number.parseInt(m[2]!, 10);
    const year = Number.parseInt(m[3]!, 10);
    const month = MONTHS[monthStr]!;
    const iso = toIso(year, month, day);
    push(m[0], iso, m.index);
  }

  // 2. ISO
  ISO_DATE.lastIndex = 0;
  while ((m = ISO_DATE.exec(text)) !== null) {
    const year = Number.parseInt(m[1]!, 10);
    const month = Number.parseInt(m[2]!, 10);
    const day = Number.parseInt(m[3]!, 10);
    const iso = toIso(year, month, day);
    push(m[0], iso, m.index);
  }

  // 3. DMY slash
  DMY_SLASH.lastIndex = 0;
  while ((m = DMY_SLASH.exec(text)) !== null) {
    const day = Number.parseInt(m[1]!, 10);
    const month = Number.parseInt(m[2]!, 10);
    const year = Number.parseInt(m[3]!, 10);
    const iso = toIso(year, month, day);
    // Avoid ambiguous if also captured as ISO-like; still push
    push(m[0], iso, m.index);
  }

  // Sort by appearance
  matches.sort((a, b) => a.index - b.index);
  return matches;
}

/**
 * Heuristic (deterministic) date extractor — local-first baseline
 * (TECHNICAL_SPEC §8 deterministic tier, ADR-007).
 *
 * Suitable for local dev, tests, and as a fallback when an LLM provider is
 * unavailable. Extracts English textual dates and D/M/Y numeric dates with
 * surrounding sentence context and label inference.
 */
export class HeuristicDateExtractor implements DateExtractor {
  name(): string {
    return 'heuristic';
  }

  async extract(input: DateExtractionInput): Promise<DateExtractionResult> {
    const text = input.text ?? '';
    if (!text.trim()) {
      const empty: DateExtractionResult = { dates: [], provider: this.name(), confidence: 0.1 };
      dateExtractionResultSchema.parse(empty);
      return empty;
    }

    const rawMatches = findMatches(text);
    const dates: ImportantDate[] = rawMatches.map((match) => {
      const context = extractSentence(text, match.index, match.length);
      const surrounding = text.slice(Math.max(0, match.index - 60), match.index + match.length + 60);
      const inferred = inferLabelAndType(context, surrounding);
      const hasLabel = inferred.label !== null;
      const confidence = confidenceFor(match.raw, match.isoDate, hasLabel) + inferred.confidenceBoost * 0.1;
      const capped = Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));

      const date: ImportantDate = {
        raw: match.raw,
        isoDate: match.isoDate,
        label: inferred.label,
        type: inferred.type,
        context,
        confidence: capped,
      };
      return date;
    });

    // Deduplicate by isoDate + raw (keep first)
    const deduped = new Map<string, ImportantDate>();
    for (const d of dates) {
      const key = `${d.isoDate ?? d.raw}:${d.raw.toLowerCase()}`;
      if (!deduped.has(key)) deduped.set(key, d);
    }
    const finalDates = [...deduped.values()];

    const overallConfidence =
      finalDates.length === 0 ? 0.2 : Math.max(...finalDates.map((d) => d.confidence));

    const result: DateExtractionResult = {
      dates: finalDates,
      provider: this.name(),
      confidence: Math.max(0, Math.min(1, overallConfidence)),
    };

    dateExtractionResultSchema.parse(result);
    return result;
  }
}

export function createHeuristicDateExtractor(): DateExtractor {
  return new HeuristicDateExtractor();
}

export function createDateExtractor(): DateExtractor {
  return new HeuristicDateExtractor();
}
