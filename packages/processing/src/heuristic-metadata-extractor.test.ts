import { describe, expect, it } from 'vitest';

import {
  createMetadataExtractor,
  HeuristicMetadataExtractor,
} from './heuristic-metadata-extractor.js';
import { metadataExtractionResultSchema } from './metadata.js';

describe('HeuristicMetadataExtractor', () => {
  const extractor = createMetadataExtractor();

  it('exposes provider name "heuristic"', () => {
    expect(extractor.name()).toBe('heuristic');
    expect(new HeuristicMetadataExtractor().name()).toBe('heuristic');
  });

  it('extracts title from first non-empty line', async () => {
    const result = await extractor.extract({
      text: '\n  Examination Form Submission Notice  \nSubmit by 18 August 2026.\nDetails follow.',
    });
    expect(result.title).toBe('Examination Form Submission Notice');
    expect(result.provider).toBe('heuristic');
    expect(result.confidence).toBeGreaterThan(0.4);
    metadataExtractionResultSchema.parse(result);
  });

  it('falls back to filename when text is empty', async () => {
    const result = await extractor.extract({ text: '   ', filename: 'exam-form_2024.pdf' });
    expect(result.title).toBe('exam form 2024');
    expect(result.tags).toEqual(expect.arrayContaining([]));
  });

  it('returns null title when both text and filename are empty', async () => {
    const result = await extractor.extract({ text: '' });
    expect(result.title).toBeNull();
  });

  it('caps title at 200 chars', async () => {
    const long = 'A'.repeat(300);
    const result = await extractor.extract({ text: long });
    expect(result.title!.length).toBeLessThanOrEqual(201);
    expect(result.title!.endsWith('…')).toBe(true);
  });

  it('classifies document type by keywords', async () => {
    const circular = await extractor.extract({ text: 'Circular regarding hostel allotment' });
    expect(circular.documentType).toBe('CIRCULAR');

    const policy = await extractor.extract({ text: 'Policy for attendance' });
    expect(policy.documentType).toBe('POLICY');

    const form = await extractor.extract({ text: 'Application form for scholarship' });
    expect(form.documentType).toBe('FORM');

    const schedule = await extractor.extract({ text: 'Timetable for semester exams' });
    expect(schedule.documentType).toBe('SCHEDULE');

    const notice = await extractor.extract({ text: 'Notice for students of BTECH' });
    expect(notice.documentType).toBe('NOTICE');

    const other = await extractor.extract({
      text: 'Random unstructured content without keywords xyz',
    });
    expect(other.documentType).toBe('OTHER');

    const empty = await extractor.extract({ text: '' });
    expect(empty.documentType).toBeNull();
  });

  it('produces summary from first two sentences', async () => {
    const result = await extractor.extract({
      text: 'Examination Form Submission Notice. Submit by 18 August 2026. Late fee applies after deadline.',
    });
    expect(result.summary).toContain('Examination Form Submission Notice');
    expect(result.summary).toContain('Submit by 18 August 2026');
  });

  it('falls back to 300-char prefix when no sentence boundary', async () => {
    const text = 'Examination form deadline is 18 August without proper sentences';
    const result = await extractor.extract({ text });
    expect(result.summary).toBeTruthy();
    expect(result.summary!.length).toBeLessThanOrEqual(300);
  });

  it('extracts known institutional tags', async () => {
    const result = await extractor.extract({
      text: 'Examination form deadline and fee payment for hostel admission.',
    });
    expect(result.tags).toEqual(
      expect.arrayContaining(['examination', 'deadline', 'fee', 'hostel']),
    );
  });

  it('caps tags at 10 and deduplicates', async () => {
    const text = `${'examination '.repeat(5)} ${'fee '.repeat(5)} ${'deadline '.repeat(5)} notice circular policy schedule form report holiday hostel library department semester course timetable scholarship placement workshop seminar`;
    const result = await extractor.extract({ text });
    expect(result.tags.length).toBeLessThanOrEqual(10);
    expect(new Set(result.tags).size).toBe(result.tags.length);
  });

  it('extracts academic year', async () => {
    const result = await extractor.extract({ text: 'Academic Year 2023-24 admission notice' });
    expect(result.academicYear).toBe('2023-2024');

    const withSlash = await extractor.extract({ text: 'For 2024/25 session' });
    expect(withSlash.academicYear).toBe('2024-2025');

    const none = await extractor.extract({ text: 'No year here' });
    expect(none.academicYear).toBeNull();
  });

  it('extracts course code', async () => {
    const result = await extractor.extract({ text: 'Notice for BTECH semester 3 students' });
    expect(result.course).toBe('BTECH');

    const none = await extractor.extract({ text: 'General notice without course' });
    expect(none.course).toBeNull();
  });

  it('extracts semester number', async () => {
    const result = await extractor.extract({ text: 'Eligible for semester 5' });
    expect(result.semester).toBe(5);

    const withDash = await extractor.extract({ text: 'sem-3 notice' });
    expect(withDash.semester).toBe(3);

    const none = await extractor.extract({ text: 'No semester mentioned' });
    expect(none.semester).toBeNull();
  });

  it('rejects out-of-range semester', async () => {
    const result = await extractor.extract({ text: 'semester 99 invalid' });
    expect(result.semester).toBeNull();
  });

  it('detects language (eng vs hin)', async () => {
    const eng = await extractor.extract({ text: 'Examination form deadline' });
    expect(eng.language).toBe('eng');

    const hin = await extractor.extract({ text: 'परीक्षा फॉर्म जमा करने की अंतिम तिथि' });
    expect(hin.language).toBe('hin');

    const empty = await extractor.extract({ text: '' });
    expect(empty.language).toBeNull();
  });

  it('assigns confidence based on text richness', async () => {
    const empty = await extractor.extract({ text: '' });
    expect(empty.confidence).toBe(0.1);

    const short = await extractor.extract({ text: 'hi' });
    expect(short.confidence).toBe(0.3);

    const rich = await extractor.extract({
      text: 'Examination Form Submission Notice\nSubmit by 18 August 2026. Details follow for all students.',
    });
    expect(rich.confidence).toBeGreaterThanOrEqual(0.45);
    expect(rich.confidence).toBeLessThanOrEqual(1);
  });

  it('always returns a valid schema-conformant result', async () => {
    const cases = [
      { text: '' },
      { text: 'Circular 2023-24' },
      {
        text: 'Examination form deadline 18 August. Fee Rs 500. Hostel notice.',
        filename: 'notice.pdf',
      },
      { text: 'परीक्षा फॉर्म', mimeType: 'application/pdf' },
    ];
    for (const c of cases) {
      const result = await extractor.extract(c);
      expect(() => metadataExtractionResultSchema.parse(result)).not.toThrow();
      expect(result.provider).toBe('heuristic');
      expect(Array.isArray(result.tags)).toBe(true);
    }
  });

  it('does not leak filename when text has a title', async () => {
    const result = await extractor.extract({
      text: 'Actual Title From Text',
      filename: 'fallback-name.pdf',
    });
    expect(result.title).toBe('Actual Title From Text');
  });
});

describe('metadataExtractionResultSchema', () => {
  it('rejects invalid documentType', () => {
    expect(() =>
      metadataExtractionResultSchema.parse({
        title: 't',
        documentType: 'INVALID',
        summary: null,
        tags: [],
        academicYear: null,
        course: null,
        semester: null,
        audience: null,
        entities: null,
        language: null,
        confidence: 0.5,
        provider: 'heuristic',
      }),
    ).toThrow();
  });

  it('rejects confidence out of range', () => {
    expect(() =>
      metadataExtractionResultSchema.parse({
        title: null,
        documentType: null,
        summary: null,
        tags: [],
        academicYear: null,
        course: null,
        semester: null,
        audience: null,
        entities: null,
        language: null,
        confidence: 2,
        provider: 'heuristic',
      }),
    ).toThrow();
  });
});
