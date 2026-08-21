/**
 * @file Create `search_analytics` table for search query logging (P5-012).
 *
 * Tracks each search for admin analytics: who searched what, when, how many
 * results, and latency. Used for popular queries, zero-result, and unresolved
 * search workflows (P5-012/013).
 *
 * See API_SPEC_SHEET.md §13 GET /admin/analytics/* and TECHNICAL_SPEC.
 *
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createTable('search_analytics', {
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
    results_count: {
      type: 'integer',
      notNull: true,
    },
    latency_ms: {
      type: 'integer',
      notNull: true,
    },
    filters: {
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

  pgm.createIndex('search_analytics', ['institution_id', 'created_at']);
  pgm.createIndex('search_analytics', ['institution_id', 'query']);
};

exports.down = (pgm) => {
  pgm.dropTable('search_analytics');
};
