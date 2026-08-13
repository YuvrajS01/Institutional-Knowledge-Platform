/**
 * @file Create the `users` and `institution_memberships` tables.
 *
 * Users are platform accounts; memberships bind a user to an institution
 * with a role, optional department/course/semester scope.
 * See `.agent/architecture/TECHNICAL_SPEC.md` §5 (User / Membership models).
 *
 * The `department_id` FK is added in P1-003 when `departments` lands.
 *
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createType('user_status', ['ACTIVE', 'INACTIVE', 'SUSPENDED']);
  pgm.createType('membership_role', [
    'STUDENT',
    'FACULTY',
    'DEPARTMENT_ADMIN',
    'APPROVER',
    'INSTITUTION_ADMIN',
    'PLATFORM_ADMIN',
  ]);

  pgm.createTable('users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    email: {
      type: 'text',
      notNull: true,
    },
    name: {
      type: 'text',
      notNull: true,
    },
    phone: {
      type: 'text',
    },
    avatar_url: {
      type: 'text',
    },
    status: {
      type: 'user_status',
      notNull: true,
      default: 'ACTIVE',
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

  pgm.sql('CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" (lower(email))');
  pgm.createIndex('users', 'status');

  pgm.createTable('institution_memberships', {
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
    role: {
      type: 'membership_role',
      notNull: true,
    },
    department_id: {
      type: 'uuid',
    },
    course: {
      type: 'text',
    },
    semester: {
      type: 'integer',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('institution_memberships', ['institution_id', 'user_id'], {
    name: 'institution_memberships_institution_user_unique',
    unique: true,
  });
  pgm.createIndex('institution_memberships', 'institution_id');
  pgm.createIndex('institution_memberships', 'user_id');
  pgm.createIndex('institution_memberships', 'role');
};

/**
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropTable('institution_memberships');
  pgm.dropTable('users');
  pgm.dropType('membership_role');
  pgm.dropType('user_status');
};
