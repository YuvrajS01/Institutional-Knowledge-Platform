/**
 * @file Create `document_chunks` table with pgvector support.
 *
 * Stores chunked text for hybrid lexical + semantic search (TECHNICAL_SPEC §9
 * chunking strategy, §10 hybrid retrieval, AI_LLM_ARCHITECTURE §8). Each chunk
 * preserves its source version, page number, and sequential index
 * (P3-008 chunker output). `embedding` is a `vector(1024)` column for the
 * BGE-M3 candidate (1024 dims); nullable until P5-004 generates embeddings.
 * `metadata` holds extensible per-chunk data (e.g., heading context).
 *
 * Depends on P3-008 (chunking) — P5-001 gate.
 *
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createExtension('vector', { ifNotExists: true });

  pgm.createTable('document_chunks', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    document_version_id: {
      type: 'uuid',
      notNull: true,
      references: 'document_versions',
      onDelete: 'CASCADE',
    },
    page_number: {
      type: 'integer',
    },
    chunk_index: {
      type: 'integer',
      notNull: true,
    },
    content: {
      type: 'text',
      notNull: true,
    },
    token_count: {
      type: 'integer',
      notNull: true,
    },
    embedding: {
      type: 'vector(1024)',
    },
    metadata: {
      type: 'jsonb',
      notNull: true,
      default: pgm.func("'{}'::jsonb"),
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('document_chunks', ['document_version_id', 'chunk_index'], {
    name: 'document_chunks_version_chunk_index_unique',
    unique: true,
  });
  pgm.createIndex('document_chunks', 'document_version_id');
  pgm.createIndex('document_chunks', 'page_number');
};

/**
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropTable('document_chunks');
  // Extension is intentionally not dropped — other tables or future migrations
  // may depend on `vector`. Drop manually if the database is being reset.
};
