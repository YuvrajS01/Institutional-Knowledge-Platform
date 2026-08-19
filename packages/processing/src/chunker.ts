/**
 * Document chunking (TECHNICAL_SPEC §9, AI_LLM_ARCHITECTURE §8).
 *
 * Default: ~300–700 tokens per chunk, 10–20% overlap, page-aware,
 * paragraph/sentence boundary preference, deterministic char-based token
 * estimation (local-first, no tokenizer dependency).
 */

export const DEFAULT_CHUNK_TARGET_TOKENS = 500;
export const DEFAULT_CHUNK_OVERLAP_TOKENS = 75; // 15% of 500
export const DEFAULT_CHUNK_MAX_TOKENS = 700;
export const DEFAULT_CHUNK_MIN_TOKENS = 100;

// Approx. 4 chars per token (common heuristic without a tokenizer).
const CHARS_PER_TOKEN = 4;

export interface ChunkingOptions {
  targetTokens?: number;
  overlapTokens?: number;
  maxTokens?: number;
  minTokens?: number;
}

export interface ChunkingInput {
  text: string;
  /** Per-page texts when available — preserves pageNumber per chunk. */
  pages?: string[];
  pageCount?: number | null;
  options?: ChunkingOptions;
}

export interface DocumentChunk {
  chunkIndex: number;
  pageNumber: number | null;
  content: string;
  tokenCount: number;
  charCount: number;
}

export function estimateTokenCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return Math.max(1, Math.ceil(trimmed.length / CHARS_PER_TOKEN));
}

function overlapChars(overlapTokens: number): number {
  return Math.max(0, overlapTokens * CHARS_PER_TOKEN);
}

function splitIntoSegments(text: string): string[] {
  // Prefer paragraph boundaries, fall back to sentence boundaries.
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const rawBlocks = paragraphs.length > 1 ? paragraphs : [text.trim()].filter((p) => p.length > 0);
  const segments: string[] = [];

  for (const block of rawBlocks) {
    // Further split long blocks by sentence boundaries to avoid single huge segment.
    // Keep the delimiter by splitting on lookbehind.
    const sentences = block.split(/(?<=[.!?।])\s+/).filter((s) => s.trim().length > 0);
    if (sentences.length > 1) {
      for (const s of sentences) {
        segments.push(s.trim());
      }
    } else {
      // No sentence boundaries — split very long blocks by single newlines.
      const lines = block
        .split(/\n+/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      if (lines.length > 1) {
        for (const l of lines) {
          segments.push(l);
        }
      } else {
        segments.push(block);
      }
    }
  }

  return segments.filter((s) => s.length > 0);
}

function getOverlapSuffix(content: string, oChars: number): string {
  if (oChars <= 0 || content.length <= oChars) {
    return content;
  }
  // Take last oChars, but try to start at a word boundary to keep overlap readable.
  let suffix = content.slice(-oChars);
  const firstSpace = suffix.indexOf(' ');
  if (firstSpace > 0 && firstSpace < oChars * 0.3) {
    suffix = suffix.slice(firstSpace + 1);
  }
  return suffix.trim();
}

function chunkSingleText(
  text: string,
  pageNumber: number | null,
  startIndex: number,
  opts: Required<ChunkingOptions>,
): DocumentChunk[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const segments = splitIntoSegments(trimmed);
  const chunks: DocumentChunk[] = [];
  let current = '';
  let currentTokens = 0;

  const emit = (content: string): void => {
    const c = content.trim();
    if (!c) return;
    const tokenCount = estimateTokenCount(c);
    chunks.push({
      chunkIndex: startIndex + chunks.length,
      pageNumber,
      content: c,
      tokenCount,
      charCount: c.length,
    });
  };

  for (const segment of segments) {
    const segTokens = estimateTokenCount(segment);

    // Segment alone exceeds maxTokens — hard-split it by chars.
    if (segTokens > opts.maxTokens) {
      // Flush current if any.
      if (current.trim()) {
        emit(current);
        current = '';
        currentTokens = 0;
      }
      // Split the oversized segment into maxTokens-sized slices with overlap.
      const maxChars = opts.maxTokens * CHARS_PER_TOKEN;
      const oChars = overlapChars(opts.overlapTokens);
      let offset = 0;
      while (offset < segment.length) {
        const slice = segment.slice(offset, offset + maxChars).trim();
        if (slice) {
          // Emit directly — these slices already respect maxTokens.
          const tokenCount = estimateTokenCount(slice);
          chunks.push({
            chunkIndex: startIndex + chunks.length,
            pageNumber,
            content: slice,
            tokenCount,
            charCount: slice.length,
          });
        }
        if (offset + maxChars >= segment.length) break;
        offset += Math.max(1, maxChars - oChars);
      }
      continue;
    }

    const separator = current ? '\n\n' : '';
    const tentative = current ? `${current}${separator}${segment}` : segment;
    const tentativeTokens = estimateTokenCount(tentative);

    if (tentativeTokens > opts.targetTokens && currentTokens >= opts.minTokens) {
      emit(current);
      const oChars = overlapChars(opts.overlapTokens);
      const overlap = getOverlapSuffix(current, oChars);
      current = overlap ? `${overlap}\n\n${segment}` : segment;
      currentTokens = estimateTokenCount(current);

      // If the new current still exceeds maxTokens, emit it immediately (rare).
      if (currentTokens > opts.maxTokens) {
        emit(current);
        current = '';
        currentTokens = 0;
      }
    } else if (tentativeTokens > opts.maxTokens) {
      // Would exceed max — emit current first, then start new with segment.
      if (current.trim()) {
        emit(current);
      }
      const oChars = overlapChars(opts.overlapTokens);
      const overlap = getOverlapSuffix(current, oChars);
      // Start new current with overlap + segment if overlap exists.
      if (overlap && segment.length < maxCharsFor(opts.maxTokens)) {
        const candidate = `${overlap}\n\n${segment}`;
        if (estimateTokenCount(candidate) <= opts.maxTokens) {
          current = candidate;
          currentTokens = estimateTokenCount(current);
        } else {
          current = segment;
          currentTokens = segTokens;
        }
      } else {
        current = segment;
        currentTokens = segTokens;
      }
    } else {
      current = tentative;
      currentTokens = tentativeTokens;
    }
  }

  if (current.trim()) {
    emit(current);
  }

  // Edge: if we produced no chunks but text was non-empty (e.g., single huge block
  // that was not segmented), ensure at least one chunk.
  if (chunks.length === 0 && trimmed) {
    emit(trimmed);
  }

  return chunks;
}

function maxCharsFor(maxTokens: number): number {
  return maxTokens * CHARS_PER_TOKEN;
}

function resolveOptions(options?: ChunkingOptions): Required<ChunkingOptions> {
  const target = options?.targetTokens ?? DEFAULT_CHUNK_TARGET_TOKENS;
  const overlap = options?.overlapTokens ?? DEFAULT_CHUNK_OVERLAP_TOKENS;
  const max = options?.maxTokens ?? DEFAULT_CHUNK_MAX_TOKENS;
  const min = options?.minTokens ?? DEFAULT_CHUNK_MIN_TOKENS;
  return {
    targetTokens: Math.max(50, target),
    overlapTokens: Math.max(0, Math.min(overlap, Math.floor(target * 0.3))),
    maxTokens: Math.max(target, max),
    minTokens: Math.max(0, Math.min(min, target - 1)),
  };
}

/**
 * Chunk a document's extracted text into page-aware chunks.
 *
 * - Empty text → 0 chunks.
 * - `pages` array (from `TextExtractionResult.pages`) is preferred for page preservation.
 * - Otherwise chunks from the single `text` string (pageNumber = 1 if pageCount == 1 else null).
 * - Deterministic, local-first, no external tokenizer/model.
 */
export function chunkDocument(input: ChunkingInput): DocumentChunk[] {
  const opts = resolveOptions(input.options);
  const text = input.text ?? '';

  // Prefer per-page chunking when pages are available.
  if (input.pages && input.pages.length > 0) {
    const allChunks: DocumentChunk[] = [];
    for (let i = 0; i < input.pages.length; i++) {
      const pageText = input.pages[i] ?? '';
      if (!pageText.trim()) continue;
      const pageNumber = i + 1;
      const pageChunks = chunkSingleText(pageText, pageNumber, allChunks.length, opts);
      allChunks.push(...pageChunks);
    }
    // Fallback: if pages were all empty but text has content, chunk text as page 1.
    if (allChunks.length === 0 && text.trim()) {
      return chunkSingleText(text, 1, 0, opts);
    }
    return allChunks;
  }

  // Single-text mode.
  if (!text.trim()) {
    return [];
  }
  return chunkSingleText(text, 1, 0, opts);
}

export interface Chunker {
  chunk(input: ChunkingInput): DocumentChunk[];
}

export class DocumentChunker implements Chunker {
  constructor(private readonly defaultOptions?: ChunkingOptions) {}

  chunk(input: ChunkingInput): DocumentChunk[] {
    return chunkDocument({
      ...input,
      options: { ...this.defaultOptions, ...input.options },
    });
  }
}

export function createChunker(options?: ChunkingOptions): Chunker {
  return new DocumentChunker(options);
}
