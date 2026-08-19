import type { WorkerDbPool } from '../db-pool.js';

export interface VersionTarget {
  id: string;
  document_id: string;
  version_number: number;
  storage_key: string;
  mime_type: string;
  extracted_text: string | null;
  ocr_status: string | null;
  processing_status: string;
}

export class ProcessingRepository {
  constructor(private readonly pool: WorkerDbPool) {}

  /**
   * Finds a document version, scoped to the tenant. Returns null when the
   * version does not exist in the institution (or the document does).
   */
  async findVersion(
    institutionId: string,
    documentId: string,
    versionId: string,
  ): Promise<VersionTarget | null> {
    const result = await this.pool.query(
      `SELECT v.id, v.document_id, v.version_number, v.storage_key, v.mime_type,
              v.extracted_text, v.ocr_status, v.processing_status
       FROM document_versions v
       JOIN documents d ON d.id = v.document_id
       WHERE v.id = $2 AND v.document_id = $3 AND d.institution_id = $1`,
      [institutionId, versionId, documentId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id as string,
      document_id: row.document_id as string,
      version_number: Number(row.version_number),
      storage_key: row.storage_key as string,
      mime_type: row.mime_type as string,
      extracted_text: (row.extracted_text as string | null) ?? null,
      ocr_status: (row.ocr_status as string | null) ?? null,
      processing_status: row.processing_status as string,
    };
  }

  async markProcessing(institutionId: string, versionId: string, status: string): Promise<void> {
    await this.pool.query(
      `UPDATE document_versions v
       SET processing_status = $3
       FROM documents d
       WHERE v.id = $2 AND d.id = v.document_id AND d.institution_id = $1`,
      [institutionId, versionId, status],
    );
  }

  async updateProcessingResult(
    institutionId: string,
    versionId: string,
    input: { text: string; ocrStatus: string; pageCount: number | null },
  ): Promise<void> {
    await this.pool.query(
      `UPDATE document_versions v
       SET extracted_text = $3, ocr_status = $4, page_count = $5, processing_status = 'COMPLETED'
       FROM documents d
       WHERE v.id = $2 AND d.id = v.document_id AND d.institution_id = $1`,
      [institutionId, versionId, input.text, input.ocrStatus, input.pageCount],
    );
  }
}
