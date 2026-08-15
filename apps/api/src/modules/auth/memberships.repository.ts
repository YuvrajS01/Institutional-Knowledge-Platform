import type { DbPool } from '../../infrastructure/db/db-pool.js';

export interface MembershipRecord {
  institution_id: string;
  institution_name: string;
  role: string;
  department_id: string | null;
  department: string | null;
  course: string | null;
  semester: number | null;
}

export class MembershipsRepository {
  constructor(private readonly pool: DbPool) {}

  async findMemberships(userId: string): Promise<MembershipRecord[]> {
    const result = await this.pool.query(
      `SELECT
        m.institution_id,
        i.name AS institution_name,
        m.role,
        m.department_id,
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
      department_id: (row.department_id as string | null) ?? null,
      department: (row.department as string | null) ?? null,
      course: (row.course as string | null) ?? null,
      semester: (row.semester as number | null) ?? null,
    }));
  }

  async findByUserAndInstitution(
    userId: string,
    institutionId: string,
  ): Promise<MembershipRecord | null> {
    const result = await this.pool.query(
      `SELECT
        m.institution_id,
        i.name AS institution_name,
        m.role,
        m.department_id,
        d.name AS department,
        m.course,
        m.semester
       FROM institution_memberships m
       JOIN institutions i ON i.id = m.institution_id
       LEFT JOIN departments d ON d.id = m.department_id
       WHERE m.user_id = $1 AND m.institution_id = $2`,
      [userId, institutionId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      institution_id: row.institution_id as string,
      institution_name: row.institution_name as string,
      role: row.role as string,
      department_id: (row.department_id as string | null) ?? null,
      department: (row.department as string | null) ?? null,
      course: (row.course as string | null) ?? null,
      semester: (row.semester as number | null) ?? null,
    };
  }
}
