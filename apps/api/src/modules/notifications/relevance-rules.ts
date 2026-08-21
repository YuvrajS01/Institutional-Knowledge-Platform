import type { DbPool } from '../../infrastructure/db/db-pool.js';

export interface RelevanceContext {
  institutionId: string;
  documentId: string;
  departmentId?: string | null;
  audience?: {
    roles?: string[];
    courses?: string[];
    semesters?: number[];
    departments?: string[];
  } | null;
  tags?: string[];
}

export interface UserMembership {
  userId: string;
  email: string;
  role: string;
  departmentId: string | null;
  course: string | null;
  semester: number | null;
}

/**
 * Relevance rules (P7-005) — determines which users should be notified
 * for a given document based on audience, department, and RBAC.
 *
 * Rules (conservative, per TECHNICAL_SPEC §15 and PRD FR-012):
 * - If audience is null/empty → notify all active members of the institution (MVP)
 * - If audience.roles includes user's role → relevant
 * - If audience.courses includes user's course → relevant
 * - If audience.semesters includes user's semester → relevant
 * - If audience.departments or departmentId matches user's department → relevant
 * - Otherwise not relevant
 *
 * For MVP, this is a simple allow-list; future versions can add per-user
 * preferences and notification throttling.
 */
export class RelevanceRules {
  constructor(private readonly pool: DbPool) {}

  async resolveRecipients(context: RelevanceContext): Promise<UserMembership[]> {
    // Fetch all active members of the institution with their membership details
    const result = await this.pool.query(
      `SELECT im.user_id AS user_id, u.email, im.role, im.department_id, im.course, im.semester
       FROM institution_memberships im
       JOIN users u ON u.id = im.user_id
       WHERE im.institution_id = $1 AND u.status = 'ACTIVE'`,
      [context.institutionId],
    );
    const members = (
      result.rows as Array<{
        user_id: string;
        email: string;
        role: string;
        department_id: string | null;
        course: string | null;
        semester: number | null;
      }>
    ).map((r) => ({
      userId: r.user_id,
      email: r.email,
      role: r.role,
      departmentId: r.department_id,
      course: r.course,
      semester: r.semester,
    }));

    const audience = context.audience;
    const hasRoles = Boolean(audience?.roles && audience.roles.length > 0);
    const hasCourses = Boolean(audience?.courses && audience.courses.length > 0);
    const hasSemesters = Boolean(audience?.semesters && audience.semesters.length > 0);
    const hasDepartments =
      Boolean(audience?.departments && audience.departments.length > 0) ||
      Boolean(context.departmentId);

    // If no audience and no department filter, notify all (MVP default)
    if (!hasRoles && !hasCourses && !hasSemesters && !hasDepartments) {
      return members;
    }

    return members.filter((m) => {
      if (hasRoles && audience!.roles!.includes(m.role)) return true;
      if (hasCourses && m.course && audience!.courses!.includes(m.course)) return true;
      if (hasSemesters && m.semester !== null && audience!.semesters!.includes(m.semester))
        return true;
      if (audience?.departments && m.departmentId && audience.departments.includes(m.departmentId))
        return true;
      if (context.departmentId && m.departmentId === context.departmentId) return true;
      return false;
    });
  }

  isRelevant(member: UserMembership, context: RelevanceContext): boolean {
    const audience = context.audience;
    const hasRoles = Boolean(audience?.roles && audience.roles.length > 0);
    const hasCourses = Boolean(audience?.courses && audience.courses.length > 0);
    const hasSemesters = Boolean(audience?.semesters && audience.semesters.length > 0);
    const hasDepartments =
      Boolean(audience?.departments && audience.departments.length > 0) ||
      Boolean(context.departmentId);
    const hasAny = hasRoles || hasCourses || hasSemesters || hasDepartments;
    if (!hasAny) return true;

    if (hasRoles && audience!.roles!.includes(member.role)) return true;
    if (hasCourses && member.course && audience!.courses!.includes(member.course)) return true;
    if (
      hasSemesters &&
      member.semester !== null &&
      audience!.semesters!.includes(member.semester)
    )
      return true;
    if (
      audience?.departments &&
      member.departmentId &&
      audience.departments.includes(member.departmentId)
    )
      return true;
    if (context.departmentId && member.departmentId === context.departmentId) return true;
    return false;
  }
}
