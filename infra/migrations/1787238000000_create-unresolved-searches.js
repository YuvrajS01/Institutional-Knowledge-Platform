/**
 * @file Create `unresolved_searches` table for explicit unresolved query saves (P5-013).
 *
 * Different from `search_analytics` (which logs every search), this table
 * stores queries that users explicitly mark as unresolved (via POST /search/unresolved
 * or admin Save as unresolved). Used for admin review and content gap analysis.
 *
 * See API_SPEC_SHEET.md §7 POST /search/unresolved and TECHNICAL_SPEC.
 *
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createTable('unresolved_searches', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    institution_id: {
      type: 'uuid',
      notNull: true,
      references: 'institutions',
      onDelete: 'CASCADE',
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    query: {
      type: 'text',
      notNull: true,
    },
    context: {
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

  pgm.createIndex('unresolved_searches', ['institution_id', 'created_at']);
  pgm.createIndex('unresolved_searches', ['institution_id', 'query']);
};

exports.down = (pgm) => {
  pgm.dropTable('unresolved_searches');
};
