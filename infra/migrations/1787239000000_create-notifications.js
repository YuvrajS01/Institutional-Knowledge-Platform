/**
 * @file Create `notifications` table for in-app and email notifications (P7-001).
 *
 * Stores per-user, per-institution notifications for new relevant notices,
 * deadlines, and other events. The table is tenant-scoped and user-scoped,
 * with read tracking via `read_at`.
 *
 * See `.agent/architecture/TECHNICAL_SPEC.md` § Notifications and
 * `API_SPEC_SHEET.md` §11 GET /notifications.
 *
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createType('notification_type', ['INFO', 'WARNING', 'URGENT', 'SYSTEM']);

  pgm.createTable('notifications', {
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
    type: {
      type: 'notification_type',
      notNull: true,
      default: 'INFO',
    },
    title: {
      type: 'text',
      notNull: true,
    },
    body: {
      type: 'text',
      notNull: true,
    },
    entity_type: {
      type: 'text',
    },
    entity_id: {
      type: 'uuid',
    },
    read_at: {
      type: 'timestamptz',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('notifications', ['user_id', 'institution_id', 'read_at']);
  pgm.createIndex('notifications', ['institution_id', 'created_at']);
  pgm.createIndex('notifications', ['user_id', 'created_at']);
};

exports.down = (pgm) => {
  pgm.dropTable('notifications');
  pgm.dropType('notification_type');
};
