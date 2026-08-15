import type { Pool } from 'pg';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  status: string;
}

export interface MembershipRecord {
  institution_id: string;
  institution_name: string;
  role: string;
  department: string | null;
  course: string | null;
  semester: number | null;
}

export class UsersRepository {
  constructor(private readonly pool: Pool) {}

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

  async findMemberships(userId: string): Promise<MembershipRecord[]> {
    const result = await this.pool.query(
      `SELECT
        m.institution_id,
        i.name AS institution_name,
        m.role,
        d.name AS department,
        m.course,
        m.semester
       FROM institution_memberships m
       JOIN institutions i ON i.id = m.institution_id
       LEFT JOIN departments d ON d.id = m.department_id
       WHERE m.user_id = $1
       ORDER BY i.created_at ASC`,
      [userId],
    );
    return result.rows.map((row) => ({
      institution_id: row.institution_id as string,
      institution_name: row.institution_name as string,
      role: row.role as string,
      department: (row.department as string | null) ?? null,
      course: (row.course as string | null) ?? null,
      semester: (row.semester as number | null) ?? null,
    }));
  }
}
