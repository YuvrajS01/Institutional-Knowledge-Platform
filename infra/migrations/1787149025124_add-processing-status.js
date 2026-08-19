/**
 * @file Add `processing_status` to `document_versions`.
 *
 * Tracks the async ingestion pipeline state (QUEUED → PROCESSING → COMPLETED
 * / FAILED) so processing is observable and resumable (AGENTS.md §10,
 * TECHNICAL_SPEC.md §6 job states).
 *
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.addColumn('document_versions', {
    processing_status: {
      type: 'text',
      notNull: true,
      default: 'QUEUED',
    },
  });
};

/**
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropColumn('document_versions', 'processing_status');
};
