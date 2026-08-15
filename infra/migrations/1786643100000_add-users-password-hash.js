/**
 * @file Add `password_hash` to `users` for local-password authentication.
 *
 * Nullable to support future OAuth-only accounts.
 * See `.agent/architecture/TECHNICAL_SPEC.md` §17 (strong password hashing).
 *
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.addColumn('users', {
    password_hash: {
      type: 'text',
    },
  });
};

/**
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropColumn('users', 'password_hash');
};
