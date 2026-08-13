/**
 * @file Create the `refresh_tokens` table for refresh-token rotation.
 *
 * Refresh tokens are opaque, stored hashed (sha-256), and rotated on every
 * refresh. See `.agent/architecture/TECHNICAL_SPEC.md` §17 (refresh token
 * rotation, JWT/session expiration).
 *
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createTable('refresh_tokens', {
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
    token_hash: {
      type: 'text',
      notNull: true,
    },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
    },
    revoked_at: {
      type: 'timestamptz',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.sql(
    'CREATE UNIQUE INDEX "refresh_tokens_token_hash_unique" ON "refresh_tokens" (token_hash)',
  );
  pgm.createIndex('refresh_tokens', 'user_id');
  pgm.createIndex('refresh_tokens', 'expires_at');
};

/**
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropTable('refresh_tokens');
};
