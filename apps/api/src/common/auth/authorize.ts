import type { Capability, Role } from '@ikp/shared';
import { hasCapability, ROLES } from '@ikp/shared';
import type { FastifyRequest } from 'fastify';
import type { DbPool } from '../../infrastructure/db/db-pool.js';
import { z } from 'zod';

import { AppError } from '../errors.js';
import { MembershipsRepository } from '../../modules/auth/memberships.repository.js';
import { createAuthenticate } from './authenticate.js';

declare module 'fastify' {
  interface FastifyRequest {
    institution?: { id: string; role: Role; departmentId: string | null };
  }
}

const institutionHeaderSchema = z.string().uuid();

function parseInstitutionId(header: string | string[] | undefined): string {
  if (typeof header !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'X-Institution-Id header is required.', 400);
  }
  const parsed = institutionHeaderSchema.safeParse(header);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'X-Institution-Id must be a valid UUID.', 400);
  }
  return parsed.data;
}

/**
 * Tenant-scoped RBAC guard.
 *
 * The institution id in the `X-Institution-Id` header is NEVER trusted
 * directly: it is resolved against the authenticated user's memberships
 * before any capability is evaluated (see `.agent/AGENTS.md` §8).
 *
 * Returns the Fastify preHandler chain: authenticate, then authorize.
 */
export function createAuthorization(options: { jwtSecret: string; pool: DbPool }) {
  const authenticate = createAuthenticate(options.jwtSecret);
  const memberships = new MembershipsRepository(options.pool);

  return function guard(capability: Capability) {
    return [
      authenticate,
      async function authorize(request: FastifyRequest): Promise<void> {
        const institutionId = parseInstitutionId(request.headers['x-institution-id']);
        const membership = await memberships.findByUserAndInstitution(
          request.user!.id,
          institutionId,
        );
        if (!membership) {
          throw AppError.forbidden('You do not have a membership in this institution.');
        }

        const role = membership.role as Role;
        if (!ROLES.includes(role) || !hasCapability(role, capability)) {
          throw AppError.forbidden();
        }

        request.institution = {
          id: membership.institution_id,
          role,
          departmentId: membership.department_id,
        };
      },
    ];
  };
}
