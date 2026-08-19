/**
 * @file Add `search_vector` for PostgreSQL full-text search (P5-005).
 *
 * Enables lexical retrieval via `tsvector` + GIN index (TECHNICAL_SPEC §10,
 * AI_LLM_ARCHITECTURE §9 hybrid lexical tier). The vector is maintained by
 * a trigger over `title`, `slug`, and `document_type` — weighted A/B for title
 * vs slug/type, matching the ranking principle that title matches outrank
 * other fields. Existing rows are backfilled; future inserts/updates are
 * automatic.
 *
 * Future P5-007 hybrid retrieval will merge this lexical candidate set with
 * semantic (vector) candidates and a reranker.
 *
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.addColumn('documents', {
    search_vector: { type: 'tsvector' },
  });

  pgm.sql(`
    CREATE OR REPLACE FUNCTION documents_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.slug, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(NEW.document_type::text, '')), 'C');
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE TRIGGER documents_search_vector_trigger
    BEFORE INSERT OR UPDATE OF title, slug, document_type ON documents
    FOR EACH ROW EXECUTE FUNCTION documents_search_vector_update();
  `);

  pgm.createIndex('documents', 'search_vector', {
    name: 'documents_search_vector_idx',
    method: 'gin',
  });

  // Backfill existing rows (trigger does not fire on ADD COLUMN).
  pgm.sql(`
    UPDATE documents
    SET search_vector =
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(slug, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(document_type::text, '')), 'C')
    WHERE search_vector IS NULL;
  `);
};

/**
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS documents_search_vector_trigger ON documents;');
  pgm.sql('DROP FUNCTION IF EXISTS documents_search_vector_update();');
  pgm.dropIndex('documents', 'search_vector', {
    name: 'documents_search_vector_idx',
    ifExists: true,
  });
  pgm.dropColumn('documents', 'search_vector');
};
