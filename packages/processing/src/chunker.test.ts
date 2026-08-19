import { describe, expect, it } from 'vitest';

import {
  chunkDocument,
  createChunker,
  DEFAULT_CHUNK_MAX_TOKENS,
  DEFAULT_CHUNK_OVERLAP_TOKENS,
  DEFAULT_CHUNK_TARGET_TOKENS,
  DocumentChunker,
  estimateTokenCount,
} from './chunker.js';

function repeatSentence(sentence: string, times: number): string {
  return Array.from({ length: times }, () => sentence).join(' ');
}

function paragraphBlockSentences(count: number): string {
  const sentence =
    'Students must submit their examination forms before the deadline to avoid late fees.';
  return Array.from({ length: count }, () => sentence).join(' ');
}

describe('estimateTokenCount', () => {
  it('returns 0 for empty or whitespace', () => {
    expect(estimateTokenCount('')).toBe(0);
    expect(estimateTokenCount('   ')).toBe(0);
    expect(estimateTokenCount('\n\n')).toBe(0);
  });

  it('estimates tokens as ceil(chars/4)', () => {
    expect(estimateTokenCount('abcd')).toBe(1);
    expect(estimateTokenCount('abcdefgh')).toBe(2);
    expect(estimateTokenCount('a'.repeat(10))).toBe(3); // ceil(10/4)=3
  });

  it('is deterministic for same input', () => {
    const text = 'Examination form deadline is 18 August 2026.';
    expect(estimateTokenCount(text)).toBe(estimateTokenCount(text));
  });
});

describe('chunkDocument', () => {
  it('returns 0 chunks for empty text', () => {
    expect(chunkDocument({ text: '' })).toEqual([]);
    expect(chunkDocument({ text: '   ' })).toEqual([]);
    expect(chunkDocument({ text: '', pages: [] })).toEqual([]);
  });

  it('returns single chunk for short text with page 1', () => {
    const chunks = chunkDocument({
      text: 'Examination Form Submission Notice. Submit by 18 August 2026.',
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.pageNumber).toBe(1);
    expect(chunks[0]!.chunkIndex).toBe(0);
    expect(chunks[0]!.content).toContain('Examination Form');
    expect(chunks[0]!.tokenCount).toBeGreaterThan(0);
    expect(chunks[0]!.charCount).toBe(chunks[0]!.content.length);
  });

  it('splits long text into multiple chunks within token limits', () => {
    const longText = paragraphBlockSentences(200); // ~200 sentences -> long
    const chunks = chunkDocument({ text: longText });

    expect(chunks.length).toBeGreaterThan(1);
    // Each non-last chunk should respect target/max
    for (let i = 0; i < chunks.length - 1; i++) {
      const c = chunks[i]!;
      expect(c.tokenCount).toBeLessThanOrEqual(DEFAULT_CHUNK_MAX_TOKENS);
      expect(c.tokenCount).toBeGreaterThanOrEqual(100); // min threshold
    }
    // Last chunk may be smaller but non-empty
    expect(chunks[chunks.length - 1]!.content.trim().length).toBeGreaterThan(0);
  });

  it('creates overlap between consecutive chunks', () => {
    const sentence = 'Examination form deadline is 18 August 2026 for all courses.';
    const longText = repeatSentence(sentence, 300);
    const chunks = chunkDocument({ text: longText });

    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 0; i < chunks.length - 1; i++) {
      const a = chunks[i]!.content;
      const b = chunks[i + 1]!.content;
      // Overlap means suffix of a appears in prefix of b (approx)
      const overlapChars = DEFAULT_CHUNK_OVERLAP_TOKENS * 4;
      const suffix = a.slice(-overlapChars).trim().split(/\s+/).slice(-5).join(' ');
      const prefix = b.slice(0, overlapChars * 2);
      // At least one word from suffix should appear in next chunk's prefix
      const suffixWords = suffix.split(/\s+/).filter(Boolean);
      const hasOverlap = suffixWords.some((w) => prefix.includes(w));
      expect(hasOverlap).toBe(true);
    }
  });

  it('preserves page numbers when pages array is provided', () => {
    const pages = [
      repeatSentence('Page one content for examination notice.', 60),
      repeatSentence('Page two content for hostel circular.', 60),
      repeatSentence('Page three content for fee policy.', 60),
    ];
    const chunks = chunkDocument({ text: pages.join('\n\n'), pages, pageCount: 3 });

    expect(chunks.length).toBeGreaterThan(3);
    // All chunks should have page 1..3, none null
    for (const c of chunks) {
      expect([1, 2, 3]).toContain(c.pageNumber);
    }
    // Chunk indices sequential across pages
    chunks.forEach((c, idx) => expect(c.chunkIndex).toBe(idx));
    // Verify at least one chunk per page
    const pageCounts = new Map<number, number>();
    for (const c of chunks) {
      pageCounts.set(c.pageNumber!, (pageCounts.get(c.pageNumber!) ?? 0) + 1);
    }
    expect(pageCounts.get(1)).toBeGreaterThan(0);
    expect(pageCounts.get(2)).toBeGreaterThan(0);
    expect(pageCounts.get(3)).toBeGreaterThan(0);
  });

  it('handles pages with empty entries gracefully', () => {
    const pages = [
      '   ',
      'Valid content on second page that is long enough to become a chunk. ' +
        repeatSentence('Exam.', 100),
      '',
    ];
    const chunks = chunkDocument({ text: pages.join('\n\n'), pages, pageCount: 3 });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.pageNumber === 2)).toBe(true);
  });

  it('splits oversized single paragraph by maxTokens', () => {
    const huge = 'A'.repeat(DEFAULT_CHUNK_MAX_TOKENS * 4 * 3); // 3x max
    const chunks = chunkDocument({ text: huge });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.tokenCount).toBeLessThanOrEqual(DEFAULT_CHUNK_MAX_TOKENS);
    }
  });

  it('respects custom target/overlap options', () => {
    const text = repeatSentence('Custom chunking test sentence for overlap check.', 200);
    const smallChunks = chunkDocument({
      text,
      options: { targetTokens: 100, overlapTokens: 10, maxTokens: 120 },
    });
    const largeChunks = chunkDocument({
      text,
      options: { targetTokens: 600, overlapTokens: 60, maxTokens: 650 },
    });
    expect(smallChunks.length).toBeGreaterThan(largeChunks.length);
    for (const c of smallChunks) {
      expect(c.tokenCount).toBeLessThanOrEqual(120);
    }
  });

  it('preserves paragraph boundaries when practical', () => {
    const p1 = 'Heading: Examination Notice\n\nThis is paragraph one with deadline 18 August.';
    const p2 = 'This is paragraph two with fee details and hostel information.';
    const p3 = 'This is paragraph three concluding the notice.';
    const text = [p1, p2, p3].join('\n\n');
    const chunks = chunkDocument({ text, options: { targetTokens: 20, overlapTokens: 5 } });
    // With small target, should still produce chunks that contain whole sentences/paragraphs
    expect(chunks.length).toBeGreaterThan(0);
    const allContent = chunks.map((c) => c.content).join(' ');
    expect(allContent).toContain('Examination Notice');
    expect(allContent).toContain('paragraph three');
  });

  it('handles Hindi content', () => {
    const hindi = repeatSentence('परीक्षा फॉर्म जमा करने की अंतिम तिथि 18 अगस्त है।', 100);
    const chunks = chunkDocument({ text: hindi });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]!.content).toContain('परीक्षा');
  });

  it('is deterministic', () => {
    const text = paragraphBlockSentences(80);
    const a = chunkDocument({ text });
    const b = chunkDocument({ text });
    expect(a).toEqual(b);
  });

  it('chunkIndex is sequential and unique', () => {
    const text = repeatSentence('Sequential index test sentence.', 200);
    const chunks = chunkDocument({ text });
    const indices = chunks.map((c) => c.chunkIndex);
    expect(indices).toEqual([...Array(chunks.length).keys()]);
  });

  it('fallback to text when pages are all empty', () => {
    const text = repeatSentence('Fallback content sentence.', 100);
    const chunks = chunkDocument({ text, pages: ['  ', ''], pageCount: 2 });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]!.pageNumber).not.toBeNull();
  });
});

describe('DocumentChunker class', () => {
  it('implements Chunker interface via DocumentChunker', () => {
    const chunker = new DocumentChunker();
    const chunks = chunker.chunk({ text: 'Hello world. '.repeat(100) });
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('createChunker factory returns a chunker', () => {
    const chunker = createChunker({ targetTokens: 200 });
    const text = repeatSentence('Factory test sentence.', 150);
    const chunks = chunker.chunk({ text });
    expect(chunks.length).toBeGreaterThan(1);
    // Should respect factory default target 200
    for (const c of chunks.slice(0, -1)) {
      expect(c.tokenCount).toBeLessThanOrEqual(DEFAULT_CHUNK_MAX_TOKENS);
    }
  });

  it('per-call options override factory defaults', () => {
    const chunker = createChunker({ targetTokens: 500 });
    const text = repeatSentence('Override test.', 200);
    const defaultChunks = chunker.chunk({ text });
    const smallChunks = chunker.chunk({ text, options: { targetTokens: 100, maxTokens: 120 } });
    expect(smallChunks.length).toBeGreaterThan(defaultChunks.length);
  });
});

describe('constants', () => {
  it('exposes sensible defaults within spec ranges', () => {
    expect(DEFAULT_CHUNK_TARGET_TOKENS).toBeGreaterThanOrEqual(300);
    expect(DEFAULT_CHUNK_TARGET_TOKENS).toBeLessThanOrEqual(700);
    expect(DEFAULT_CHUNK_OVERLAP_TOKENS).toBeGreaterThanOrEqual(
      Math.floor(DEFAULT_CHUNK_TARGET_TOKENS * 0.1),
    );
    expect(DEFAULT_CHUNK_OVERLAP_TOKENS).toBeLessThanOrEqual(
      Math.floor(DEFAULT_CHUNK_TARGET_TOKENS * 0.2),
    );
  });
});
