/**
 * @file Add supersession tracking to `documents`.
 *
 * Stores the supersession link for `POST /documents/:id/supersede`
 * (API_SPEC_SHEET §6, P4-003). When a PUBLISHED document is superseded by
 * another, its `status` becomes `SUPERSEDED` and the link is recorded.
 *
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.addColumn('documents', {
    superseded_by_document_id: {
      type: 'uuid',
      references: 'documents',
      onDelete: 'SET NULL',
    },
    superseded_reason: {
      type: 'text',
    },
    superseded_at: {
      type: 'timestamptz',
    },
  });
  pgm.createIndex('documents', 'superseded_by_document_id');
};

/**
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropIndex('documents', 'superseded_by_document_id');
  pgm.dropColumn('documents', 'superseded_by_document_id');
  pgm.dropColumn('documents', 'superseded_reason');
  pgm.dropColumn('documents', 'superseded_at');
};
