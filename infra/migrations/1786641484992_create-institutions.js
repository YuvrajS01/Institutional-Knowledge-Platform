/**
 * @file Create the `institutions` table (tenant root entity).
 *
 * Every tenant-scoped resource in the platform belongs to an institution.
 * See `.agent/architecture/TECHNICAL_SPEC.md` §5 (Institution model).
 *
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createType('institution_status', ['ACTIVE', 'INACTIVE', 'SUSPENDED']);

  pgm.createTable('institutions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    name: {
      type: 'text',
      notNull: true,
    },
    slug: {
      type: 'text',
      notNull: true,
      unique: true,
    },
    logo_url: {
      type: 'text',
    },
    status: {
      type: 'institution_status',
      notNull: true,
      default: 'ACTIVE',
    },
    timezone: {
      type: 'text',
      notNull: true,
      default: 'UTC',
    },
    settings: {
      type: 'jsonb',
      notNull: true,
      default: pgm.func("'{}'::jsonb"),
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('institutions', 'status');
};

/**
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropTable('institutions');
  pgm.dropType('institution_status');
};
