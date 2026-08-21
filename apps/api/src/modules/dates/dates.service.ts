import type { DbPool } from '../../infrastructure/db/db-pool.js';

export interface ImportantDateQuery {
  from?: string;
  to?: string;
  department_id?: string;
  course?: string;
  semester?: number;
  page?: number;
  limit?: number;
}

export interface ImportantDateView {
  id: string;
  title: string;
  date: string;
  raw: string;
  type: string | null;
  label: string | null;
  context: string | null;
  source_document_id: string;
  source_document_title: string;
  department_id: string | null;
  course: string | null;
  semester: number | null;
}

export class DatesService {
  constructor(private readonly pool: DbPool) {}

  async list(institutionId: string, query: ImportantDateQuery): Promise<{ data: ImportantDateView[]; total: number }> {
    if (!institutionId) throw new Error('institutionId required');

    const fromDate = query.from ? new Date(query.from) : null;
    const toDate = query.to ? new Date(query.to) : null;
    if (fromDate && Number.isNaN(fromDate.getTime())) throw new Error('Invalid from date');
    if (toDate && Number.isNaN(toDate.getTime())) throw new Error('Invalid to date');

    // Fetch published documents with extracted_dates for this institution
    // We paginate after flattening, so we fetch a bit more than needed
    const departmentFilter = query.department_id ?? null;
    const courseFilter = query.course ?? null;
    const semesterFilter = query.semester ?? null;

    // Query documents + metadata + extracted_dates
    const params: unknown[] = [institutionId];
    const conditions: string[] = [
      'd.institution_id = $1',
      "d.status = 'PUBLISHED'",
      'm.extracted_dates IS NOT NULL',
      'jsonb_array_length(m.extracted_dates) > 0',
    ];
    if (departmentFilter) {
      params.push(departmentFilter);
      conditions.push(`d.department_id = $${params.length}`);
    }
    if (courseFilter) {
      params.push(courseFilter);
      conditions.push(`m.course = $${params.length}`);
    }
    if (semesterFilter !== null && semesterFilter !== undefined) {
      params.push(semesterFilter);
      conditions.push(`m.semester = $${params.length}`);
    }

    const sql = `
      SELECT
        d.id as document_id,
        d.title as document_title,
        d.department_id,
        d.published_at,
        m.course,
        m.semester,
        m.extracted_dates,
        m.audience
      FROM documents d
      JOIN document_metadata m ON m.document_id = d.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY d.published_at DESC
      LIMIT 100
    `;

    const result = await this.pool.query(sql, params);

    const all: ImportantDateView[] = [];
    for (const row of result.rows as Array<Record<string, unknown>>) {
      const extracted = (row.extracted_dates as unknown[]) ?? [];
      const docId = row.document_id as string;
      const docTitle = row.document_title as string;
      const deptId = (row.department_id as string | null) ?? null;
      const course = (row.course as string | null) ?? null;
      const semester = (row.semester as number | null) ?? null;

      for (const entry of extracted as Array<Record<string, unknown>>) {
        const raw = (entry.raw as string) ?? '';
        const isoDate = (entry.isoDate as string | null) ?? (entry.iso_date as string | null) ?? null;
        if (!isoDate) continue;
        const dateStr = isoDate;
        // Filter by from/to
        if (fromDate && new Date(dateStr) < fromDate) continue;
        if (toDate && new Date(dateStr) > toDate) continue;

        all.push({
          id: `${docId}-${raw}-${dateStr}`.replace(/\s+/g, '-'),
          title: (entry.label as string | null) ? `${entry.label as string} — ${docTitle}` : docTitle,
          date: dateStr,
          raw,
          type: (entry.type as string | null) ?? null,
          label: (entry.label as string | null) ?? null,
          context: (entry.context as string | null) ?? null,
          source_document_id: docId,
          source_document_title: docTitle,
          department_id: deptId,
          course,
          semester,
        });
      }
    }

    // Sort by date ascending (upcoming first)
    all.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const total = all.length;
    const start = (page - 1) * limit;
    const data = all.slice(start, start + limit);

    return { data, total };
  }
}
