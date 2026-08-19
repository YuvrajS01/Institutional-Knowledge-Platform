export interface DocumentChunkRow {
  id: string;
  document_version_id: string;
  page_number: number | null;
  chunk_index: number;
  content: string;
  token_count: number;
  embedding: unknown | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CreateChunkInput {
  page_number: number | null;
  chunk_index: number;
  content: string;
  token_count: number;
  embedding?: number[] | null;
  metadata?: Record<string, unknown> | null;
}
