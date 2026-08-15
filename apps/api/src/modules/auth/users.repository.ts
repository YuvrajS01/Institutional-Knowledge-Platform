import type { DbPool } from '../../infrastructure/db/db-pool.js';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  status: string;
}

export class UsersRepository {
  constructor(private readonly pool: DbPool) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const result = await this.pool.query(
      'SELECT id, email, name, password_hash, status FROM users WHERE lower(email) = lower($1)',
      [email],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id as string,
      email: row.email as string,
      name: row.name as string,
      passwordHash: row.password_hash as string,
      status: row.status as string,
    };
  }

  async findById(id: string): Promise<UserRecord | null> {
    const result = await this.pool.query(
      'SELECT id, email, name, password_hash, status FROM users WHERE id = $1',
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id as string,
      email: row.email as string,
      name: row.name as string,
      passwordHash: row.password_hash as string,
      status: row.status as string,
    };
  }
}
