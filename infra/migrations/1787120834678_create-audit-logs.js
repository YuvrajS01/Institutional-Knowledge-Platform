/**
 * @file Create the `audit_logs` table.
 *
 * Immutable, append-only record of institutional actions. See
 * `.agent/architecture/TECHNICAL_SPEC.md` §5 (Audit Logs model) and
 * `.agent/AGENTS.md` §7.4/§20 (auditability).
 *
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createTable('audit_logs', {
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
    actor_user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'RESTRICT',
    },
    action: {
      type: 'text',
      notNull: true,
    },
    entity_type: {
      type: 'text',
      notNull: true,
    },
    entity_id: {
      type: 'uuid',
      notNull: true,
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

  pgm.createIndex('audit_logs', ['institution_id', 'created_at']);
  pgm.createIndex('audit_logs', ['institution_id', 'action']);
  pgm.createIndex('audit_logs', ['institution_id', 'entity_type']);
  pgm.createIndex('audit_logs', 'actor_user_id');
};

/**
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropTable('audit_logs');
};
