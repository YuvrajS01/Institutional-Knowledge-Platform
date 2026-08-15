import type { DbPool } from '../../infrastructure/db/db-pool.js';

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
}

export class RefreshTokenRepository {
  constructor(private readonly pool: DbPool) {}

  async create(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [userId, tokenHash, expiresAt],
    );
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
    const result = await this.pool.query(
      'SELECT id, user_id, token_hash, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1',
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id as string,
      user_id: row.user_id as string,
      token_hash: row.token_hash as string,
      expires_at: row.expires_at as Date,
      revoked_at: (row.revoked_at as Date | null) ?? null,
    };
  }

  async revoke(id: string): Promise<void> {
    await this.pool.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [id]);
  }
}
