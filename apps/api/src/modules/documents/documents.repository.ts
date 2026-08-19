import type { DocumentStatus, DocumentType } from '@ikp/shared';
import type { DbPool } from '../../infrastructure/db/db-pool.js';
import { TenantRepository } from '../../infrastructure/db/tenant-repository.js';

export interface DocumentRow {
  id: string;
  institution_id: string;
  current_version_id: string | null;
  title: string;
  slug: string;
  document_type: DocumentType;
  status: DocumentStatus;
  department_id: string | null;
  published_at: Date | null;
  effective_from: Date | null;
  effective_to: Date | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface DocumentCreateInput {
  title: string;
  slug: string;
  document_type: DocumentType;
  department_id?: string;
  created_by: string;
}

export interface DocumentUpdateInput {
  title?: string;
  document_type?: DocumentType;
  department_id?: string | null;
  effective_from?: Date | null;
  effective_to?: Date | null;
}

export interface DocumentListFilter {
  search?: string;
  department_id?: string;
  document_type?: DocumentType;
  statuses?: DocumentStatus[];
  academic_year?: string;
  course?: string;
  semester?: number;
  tag?: string;
  published_from?: Date;
  published_to?: Date;
  sort?: 'recent' | 'oldest';
  limit: number;
  offset: number;
}

export interface DocumentListItem {
  id: string;
  title: string;
  slug: string;
  document_type: DocumentType;
  status: DocumentStatus;
  department_id: string | null;
  department_name: string | null;
  published_at: Date | null;
  effective_from: Date | null;
  effective_to: Date | null;
  academic_year: string | null;
  course: string | null;
  semester: number | null;
  tags: unknown[];
  created_at: Date;
  updated_at: Date;
}

function mapDocumentRow(row: Record<string, unknown>): DocumentRow {
  return {
    id: row.id as string,
    institution_id: row.institution_id as string,
    current_version_id: (row.current_version_id as string | null) ?? null,
    title: row.title as string,
    slug: row.slug as string,
    document_type: row.document_type as DocumentType,
    status: row.status as DocumentStatus,
    department_id: (row.department_id as string | null) ?? null,
    published_at: (row.published_at as Date | null) ?? null,
    effective_from: (row.effective_from as Date | null) ?? null,
    effective_to: (row.effective_to as Date | null) ?? null,
    created_by: row.created_by as string,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

const SELECT_COLUMNS = [
  'id',
  'institution_id',
  'current_version_id',
  'title',
  'slug',
  'document_type',
  'status',
  'department_id',
  'published_at',
  'effective_from',
  'effective_to',
  'created_by',
  'created_at',
  'updated_at',
].join(', ');

export class DocumentsRepository extends TenantRepository {
  constructor(pool: DbPool) {
    super(pool);
  }

  async create(institutionId: string, input: DocumentCreateInput): Promise<DocumentRow> {
    const tenantId = this.tenantId(institutionId);
    const result = await this.pool.query(
      `INSERT INTO documents (institution_id, title, slug, document_type, department_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${SELECT_COLUMNS}`,
      [
        tenantId,
        input.title,
        input.slug,
        input.document_type,
        input.department_id ?? null,
        input.created_by,
      ],
    );
    return mapDocumentRow(result.rows[0] as Record<string, unknown>);
  }

  async findById(institutionId: string, id: string): Promise<DocumentRow | null> {
    const tenantId = this.tenantId(institutionId);
    const result = await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM documents d
       WHERE d.id = $2 AND ${this.tenantCondition('d', 1)}`,
      [tenantId, id],
    );
    const row = result.rows[0];
    return row ? mapDocumentRow(row as Record<string, unknown>) : null;
  }

  async existsSlug(institutionId: string, slug: string): Promise<boolean> {
    const tenantId = this.tenantId(institutionId);
    const result = await this.pool.query(
      `SELECT 1 FROM documents d WHERE d.slug = $2 AND ${this.tenantCondition('d', 1)}`,
      [tenantId, slug],
    );
    return result.rows.length > 0;
  }

  async setCurrentVersion(institutionId: string, id: string, versionId: string): Promise<void> {
    const tenantId = this.tenantId(institutionId);
    await this.pool.query(
      `UPDATE documents d
       SET current_version_id = $3, updated_at = now()
       WHERE d.id = $2 AND ${this.tenantCondition('d', 1)}`,
      [tenantId, id, versionId],
    );
  }

  async updateStatus(
    institutionId: string,
    id: string,
    status: DocumentStatus,
    options: { published_at?: Date | null } = {},
  ): Promise<DocumentRow | null> {
    const tenantId = this.tenantId(institutionId);
    const result = await this.pool.query(
      `UPDATE documents d
       SET status = $3, published_at = COALESCE($4, d.published_at), updated_at = now()
       WHERE d.id = $2 AND ${this.tenantCondition('d', 1)}
       RETURNING ${SELECT_COLUMNS}`,
      [tenantId, id, status, options.published_at === undefined ? null : options.published_at],
    );
    const row = result.rows[0];
    return row ? mapDocumentRow(row as Record<string, unknown>) : null;
  }

  async update(
    institutionId: string,
    id: string,
    input: DocumentUpdateInput,
  ): Promise<DocumentRow | null> {
    const tenantId = this.tenantId(institutionId);
    const result = await this.pool.query(
      `UPDATE documents d
       SET title = COALESCE($3, d.title),
           document_type = COALESCE($4, d.document_type),
           department_id = COALESCE($5, d.department_id),
           effective_from = COALESCE($6, d.effective_from),
           effective_to = COALESCE($7, d.effective_to),
           updated_at = now()
       WHERE d.id = $2 AND ${this.tenantCondition('d', 1)}
       RETURNING ${SELECT_COLUMNS}`,
      [
        tenantId,
        id,
        input.title ?? null,
        input.document_type ?? null,
        input.department_id === undefined ? null : input.department_id,
        input.effective_from === undefined ? null : input.effective_from,
        input.effective_to === undefined ? null : input.effective_to,
      ],
    );
    const row = result.rows[0];
    return row ? mapDocumentRow(row as Record<string, unknown>) : null;
  }

  /**
   * Lists tenant documents with filters. Visibility (status filtering by
   * role) is applied by the caller via `statuses`.
   */
  async list(institutionId: string, filter: DocumentListFilter): Promise<DocumentListItem[]> {
    const tenantId = this.tenantId(institutionId);
    const built = this.buildListQuery(filter);
    built.where.push(this.tenantCondition('d', 1));
    const params: unknown[] = [tenantId, ...built.params];
    params.push(filter.limit, filter.offset);

    const order = filter.sort === 'oldest' ? 'ASC' : 'DESC';
    const result = await this.pool.query(
      `SELECT
         d.id, d.title, d.slug, d.document_type, d.status, d.department_id,
         d.published_at, d.effective_from, d.effective_to, d.created_at, d.updated_at,
         dept.name AS department_name,
         m.academic_year, m.course, m.semester, m.tags
       FROM documents d
       LEFT JOIN departments dept ON dept.id = d.department_id
       LEFT JOIN document_metadata m ON m.document_id = d.id
       WHERE ${built.where.join(' AND ')}
       ORDER BY d.created_at ${order}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return result.rows.map((row) => mapDocumentListItem(row as Record<string, unknown>));
  }

  async listCount(
    institutionId: string,
    filter: Omit<DocumentListFilter, 'limit' | 'offset' | 'sort'>,
  ): Promise<number> {
    const tenantId = this.tenantId(institutionId);
    const built = this.buildListQuery(filter);
    built.where.push(this.tenantCondition('d', 1));
    const params: unknown[] = [tenantId, ...built.params];

    const result = await this.pool.query(
      `SELECT count(*) AS total
       FROM documents d
       LEFT JOIN document_metadata m ON m.document_id = d.id
       WHERE ${built.where.join(' AND ')}`,
      params,
    );
    return Number((result.rows[0] as { total: string }).total);
  }

  private buildListQuery(filter: Omit<DocumentListFilter, 'limit' | 'offset'>): {
    where: string[];
    params: unknown[];
  } {
    // The tenant id is bound as $1; filter parameters start at $2.
    const where: string[] = [];
    const params: unknown[] = [];
    let nextIndex = 2;
    const push = (value: unknown): number => {
      params.push(value);
      return nextIndex++;
    };

    if (filter.search) {
      where.push(`d.title ILIKE $${push(`%${filter.search}%`)}`);
    }
    if (filter.department_id) {
      where.push(`d.department_id = $${push(filter.department_id)}`);
    }
    if (filter.document_type) {
      where.push(`d.document_type = $${push(filter.document_type)}`);
    }
    if (filter.statuses && filter.statuses.length > 0) {
      where.push(`d.status = ANY($${push(filter.statuses)})`);
    }
    if (filter.academic_year) {
      where.push(`m.academic_year = $${push(filter.academic_year)}`);
    }
    if (filter.course) {
      where.push(`m.course = $${push(filter.course)}`);
    }
    if (filter.semester !== undefined) {
      where.push(`m.semester = $${push(filter.semester)}`);
    }
    if (filter.tag) {
      where.push(`m.tags @> $${push(JSON.stringify([filter.tag]))}::jsonb`);
    }
    if (filter.published_from) {
      where.push(`d.published_at >= $${push(filter.published_from)}`);
    }
    if (filter.published_to) {
      where.push(`d.published_at <= $${push(filter.published_to)}`);
    }

    return { where, params };
  }
}

function mapDocumentListItem(row: Record<string, unknown>): DocumentListItem {
  return {
    id: row.id as string,
    title: row.title as string,
    slug: row.slug as string,
    document_type: row.document_type as DocumentType,
    status: row.status as DocumentStatus,
    department_id: (row.department_id as string | null) ?? null,
    department_name: (row.department_name as string | null) ?? null,
    published_at: (row.published_at as Date | null) ?? null,
    effective_from: (row.effective_from as Date | null) ?? null,
    effective_to: (row.effective_to as Date | null) ?? null,
    academic_year: (row.academic_year as string | null) ?? null,
    course: (row.course as string | null) ?? null,
    semester: (row.semester as number | null) ?? null,
    tags: (row.tags as unknown[]) ?? [],
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}
