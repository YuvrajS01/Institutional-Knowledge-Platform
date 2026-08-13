/**
 * @file Create the `departments` table and wire the `department_id` FK on
 * `institution_memberships` that was deliberately deferred from P1-002.
 *
 * See `.agent/architecture/TECHNICAL_SPEC.md` §5 (Department model) and
 * `.agent/api/API_SPEC_SHEET.md` §5 (departments use soft deactivation).
 *
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createType('department_status', ['ACTIVE', 'INACTIVE']);

  pgm.createTable('departments', {
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
    name: {
      type: 'text',
      notNull: true,
    },
    code: {
      type: 'text',
      notNull: true,
    },
    status: {
      type: 'department_status',
      notNull: true,
      default: 'ACTIVE',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('departments', ['institution_id', 'code'], {
    name: 'departments_institution_code_unique',
    unique: true,
  });
  pgm.createIndex('departments', 'institution_id');
  pgm.createIndex('departments', 'status');

  pgm.addConstraint('institution_memberships', 'institution_memberships_department_id_fkey', {
    foreignKeys: {
      columns: 'department_id',
      references: 'departments',
      onDelete: 'SET NULL',
    },
  });
};

/**
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropConstraint('institution_memberships', 'institution_memberships_department_id_fkey');
  pgm.dropTable('departments');
  pgm.dropType('department_status');
};
