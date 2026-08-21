/**
 * @file Create `bookmarks` table for saved documents (P6-005).
 *
 * Each bookmark is tenant-scoped (user + institution + document) and
 * tracks when a user saved a document for later. The table enforces
 * uniqueness per user/document and cascades on user/document deletion
 * (bookmarks are personal, not institutional records).
 *
 * See `.agent/architecture/TECHNICAL_SPEC.md` (bookmarks), `API_SPEC_SHEET.md`
 * §9 `/bookmarks`, and `AGENTS.md` §8 (tenant isolation).
 *
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createTable('bookmarks', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    document_id: {
      type: 'uuid',
      notNull: true,
      references: 'documents',
      onDelete: 'CASCADE',
    },
    institution_id: {
      type: 'uuid',
      notNull: true,
      references: 'institutions',
      onDelete: 'CASCADE',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.addConstraint('bookmarks', 'bookmarks_user_document_unique', {
    unique: ['user_id', 'document_id'],
  });

  pgm.createIndex('bookmarks', ['user_id', 'institution_id']);
  pgm.createIndex('bookmarks', ['document_id']);
  pgm.createIndex('bookmarks', ['institution_id']);
};

exports.down = (pgm) => {
  pgm.dropTable('bookmarks');
};
