import { describe, expect, it } from 'vitest';

import { HeuristicDateExtractor, createHeuristicDateExtractor } from './heuristic-date-extractor.js';
import { dateExtractionResultSchema } from './dates.js';

describe('HeuristicDateExtractor', () => {
  const extractor = createHeuristicDateExtractor();

  it('exposes provider name "heuristic"', () => {
    expect(extractor.name()).toBe('heuristic');
    expect(new HeuristicDateExtractor().name()).toBe('heuristic');
  });

  it('extracts "18 August 2026" with deadline label', async () => {
    const result = await extractor.extract({
      text: 'Examination Form Submission Notice. Submit by 18 August 2026. Late fee applies after deadline.',
    });
    expect(result.dates.length).toBeGreaterThanOrEqual(1);
    const d = result.dates[0]!;
    expect(d.raw).toContain('18 August 2026');
    expect(d.isoDate).toBe('2026-08-18');
    expect(d.label).toBe('deadline');
    expect(d.type).toBe('DEADLINE');
    expect(d.context).toContain('18 August 2026');
    expect(d.confidence).toBeGreaterThan(0.6);
    expect(result.provider).toBe('heuristic');
    dateExtractionResultSchema.parse(result);
  });

  it('extracts "August 18, 2026" format', async () => {
    const result = await extractor.extract({ text: 'Deadline is August 18, 2026 for submission.' });
    expect(result.dates[0]!.isoDate).toBe('2026-08-18');
  });

  it('extracts ISO "2026-08-18"', async () => {
    const result = await extractor.extract({ text: 'Event on 2026-08-18 at auditorium.' });
    expect(result.dates[0]!.isoDate).toBe('2026-08-18');
    expect(result.dates[0]!.raw).toBe('2026-08-18');
  });

  it('extracts DMY "18/08/2026"', async () => {
    const result = await extractor.extract({ text: 'Last date 18/08/2026 for hostel fee.' });
    expect(result.dates[0]!.isoDate).toBe('2026-08-18');
  });

  it('extracts DMY with dash "18-08-2026" and dot "18.08.2026"', async () => {
    const dash = await extractor.extract({ text: 'Deadline 18-08-2026' });
    expect(dash.dates[0]!.isoDate).toBe('2026-08-18');
    const dot = await extractor.extract({ text: 'Deadline 18.08.2026' });
    expect(dot.dates[0]!.isoDate).toBe('2026-08-18');
  });

  it('handles ordinal "18th August 2026"', async () => {
    const result = await extractor.extract({ text: 'Submit by 18th August 2026.' });
    expect(result.dates[0]!.isoDate).toBe('2026-08-18');
  });

  it('infer label exam for exam context', async () => {
    const result = await extractor.extract({ text: 'Examination will be held on 15 September 2026.' });
    expect(result.dates[0]!.label).toBe('exam');
    expect(result.dates[0]!.type).toBe('EXAM');
  });

  it('returns empty array when no date', async () => {
    const result = await extractor.extract({ text: 'No date here, just general notice.' });
    expect(result.dates).toEqual([]);
    expect(result.confidence).toBe(0.2);
  });

  it('handles empty text', async () => {
    const result = await extractor.extract({ text: '   ' });
    expect(result.dates).toEqual([]);
    expect(result.confidence).toBe(0.1);
  });

  it('deduplicates same date', async () => {
    const result = await extractor.extract({
      text: 'Deadline 18 August 2026. Again deadline 18 August 2026.',
    });
    // Should dedup to 1
    expect(result.dates.length).toBe(1);
  });

  it('extracts multiple distinct dates', async () => {
    const result = await extractor.extract({
      text: 'Registration opens 01 August 2026. Deadline is 18 August 2026. Exam on 15 September 2026.',
    });
    expect(result.dates.length).toBe(3);
    expect(result.dates.map((d) => d.isoDate)).toEqual(
      expect.arrayContaining(['2026-08-01', '2026-08-18', '2026-09-15']),
    );
  });

  it('caps context at 500 chars', async () => {
    const longSentence = `Deadline is 18 August 2026. ${'x '.repeat(300)}`;
    const result = await extractor.extract({ text: longSentence });
    expect(result.dates[0]!.context!.length).toBeLessThanOrEqual(501);
  });

  it('validates isoDate and rejects invalid date 31 Feb', async () => {
    const result = await extractor.extract({ text: 'Invalid date 31 February 2026 should be null.' });
    // Should still extract raw but iso null because invalid
    // Our extractor will attempt to parse 31 Feb -> isValidDate false -> iso null
    const d = result.dates.find((x) => x.raw.includes('31 February'));
    if (d) {
      expect(d.isoDate).toBeNull();
      expect(d.confidence).toBe(0.3);
    }
  });

  it('always returns schema-conformant result', async () => {
    const cases = [
      { text: '' },
      { text: 'Circular 2023-24' },
      { text: 'Deadline 18 August 2026 and 2026-08-19' },
      { text: 'परीक्षा 18 August 2026' },
    ];
    for (const c of cases) {
      const result = await extractor.extract(c);
      expect(() => dateExtractionResultSchema.parse(result)).not.toThrow();
      expect(result.provider).toBe('heuristic');
    }
  });
});

describe('dateExtractionResultSchema', () => {
  it('rejects invalid isoDate format', () => {
    expect(() =>
      dateExtractionResultSchema.parse({
        dates: [{ raw: '18 Aug 2026', isoDate: '2026/08/18', label: null, type: null, context: null, confidence: 0.8 }],
        provider: 'heuristic',
        confidence: 0.8,
      }),
    ).toThrow();
  });

  it('rejects confidence out of range', () => {
    expect(() =>
      dateExtractionResultSchema.parse({
        dates: [],
        provider: 'heuristic',
        confidence: 2,
      }),
    ).toThrow();
  });
});
