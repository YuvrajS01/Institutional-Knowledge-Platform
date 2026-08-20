import { describe, expect, it } from 'vitest';

import {
  assertValidCitation,
  assertValidCitations,
  citationSchema,
  extractCitedIndices,
  filterCitationsByIndices,
  isUnsupportedAnswer,
  toApiCitation,
  UNSUPPORTED_ANSWER,
  unsupportedAnswer,
} from './citation.js';

const VALID_CITATION = {
  document_id: '11111111-1111-4111-a111-111111111111',
  document_title: 'Examination Form Submission Notice',
  version_id: '22222222-2222-4222-a222-222222222222',
  page: 1,
  chunk_id: '33333333-3333-4333-a333-333333333333',
};

describe('Citation contract (P8-007)', () => {
  it('validates a correct citation', () => {
    expect(() => citationSchema.parse(VALID_CITATION)).not.toThrow();
    expect(() => assertValidCitation(VALID_CITATION)).not.toThrow();
  });

  it('allows null page and missing chunk_id', () => {
    const c = { ...VALID_CITATION, page: null, chunk_id: undefined };
    expect(() => citationSchema.parse(c)).not.toThrow();
  });

  it('rejects missing version_id (prevents hallucinated provenance)', () => {
    const { version_id: _omit, ...rest } = VALID_CITATION;
    void _omit;
    expect(() => citationSchema.parse(rest)).toThrow();
  });

  it('rejects invalid uuid', () => {
    expect(() => citationSchema.parse({ ...VALID_CITATION, document_id: 'not-a-uuid' })).toThrow();
  });

  it('rejects invalid page (0)', () => {
    expect(() => citationSchema.parse({ ...VALID_CITATION, page: 0 })).toThrow();
  });

  it('validates array of citations', () => {
    expect(() =>
      assertValidCitations([VALID_CITATION, { ...VALID_CITATION, page: null }]),
    ).not.toThrow();
    expect(() =>
      assertValidCitations([{ ...VALID_CITATION, version_id: 'bad' } as unknown as never]),
    ).toThrow();
  });

  it('toApiCitation strips internal fields and keeps spec fields', () => {
    const api = toApiCitation(VALID_CITATION);
    expect(api).toEqual({
      document_id: VALID_CITATION.document_id,
      document_title: VALID_CITATION.document_title,
      version_id: VALID_CITATION.version_id,
      page: 1,
    });
    // chunk_id not in api
    expect((api as unknown as Record<string, unknown>).chunk_id).toBeUndefined();
  });

  it('extractCitedIndices parses [n] markers', () => {
    expect(extractCitedIndices('Answer [1] and [2] and [99] invalid [0] and [abc]', 2)).toEqual([
      1, 2,
    ]);
    expect(extractCitedIndices('No citations here', 3)).toEqual([]);
    expect(extractCitedIndices('Multiple [1][1][2]', 2)).toEqual([1, 2]);
  });

  it('filterCitationsByIndices returns only cited', () => {
    const citations = [
      VALID_CITATION,
      { ...VALID_CITATION, document_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' },
    ];
    expect(filterCitationsByIndices(citations, [2])).toHaveLength(1);
    expect(filterCitationsByIndices(citations, [2])[0]!.document_id).toBe(
      'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    );
    expect(filterCitationsByIndices(citations, [])).toHaveLength(0);
  });
});

describe('Unsupported answer behavior (P8-008)', () => {
  it('isUnsupportedAnswer detects canonical sentence', () => {
    expect(isUnsupportedAnswer(UNSUPPORTED_ANSWER)).toBe(true);
    expect(isUnsupportedAnswer(`Prefix ${UNSUPPORTED_ANSWER} suffix`)).toBe(true);
    expect(isUnsupportedAnswer('Some other answer [1]')).toBe(false);
  });

  it('unsupportedAnswer returns spec shape', () => {
    const u = unsupportedAnswer();
    expect(u.answer).toBe(UNSUPPORTED_ANSWER);
    expect(u.grounded).toBe(false);
    expect(u.confidence).toBe('low');
    expect(u.citations).toHaveLength(0);
  });

  it('unsupported answer text matches API spec exactly', () => {
    expect(UNSUPPORTED_ANSWER).toBe(
      "I couldn't find an official institutional document confirming this.",
    );
  });
});
