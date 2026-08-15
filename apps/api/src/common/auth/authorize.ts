import type { Capability, Role } from '@ikp/shared';
import { hasCapability, ROLES } from '@ikp/shared';
import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { z } from 'zod';

import { AppError } from '../errors.js';
import type { DbPool } from '../../infrastructure/db/db-pool.js';
import { MembershipsRepository } from '../../modules/auth/memberships.repository.js';
import { createAuthenticate } from './authenticate.js';

declare module 'fastify' {
  interface FastifyRequest {
    institution?: { id: string; role: Role; departmentId: string | null };
  }
}

export type FastifyPreHandler = preHandlerAsyncHookHandler;

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

export interface Authorization {
  /**
   * Fastify preHandler chain for capability-gated routes:
   * authenticate → resolve membership → check capability.
   */
  guard(capability: Capability): FastifyPreHandler[];
  /**
   * Fastify preHandler chain for any authenticated member of the tenant
   * (no capability check).
   */
  requireMember: FastifyPreHandler[];
}

/**
 * Tenant-scoped authorization factory.
 *
 * The institution id in the `X-Institution-Id` header is NEVER trusted
 * directly: it is resolved against the authenticated user's memberships
 * before any capability is evaluated (see `.agent/AGENTS.md` §8).
 */
export function createAuthorization(options: { jwtSecret: string; pool: DbPool }): Authorization {
  const authenticate = createAuthenticate(options.jwtSecret);
  const memberships = new MembershipsRepository(options.pool);

  const authorizeMember: PreHandlerImpl = async (request: FastifyRequest): Promise<void> => {
    const institutionId = parseInstitutionId(request.headers['x-institution-id']);
    const membership = await memberships.findByUserAndInstitution(request.user!.id, institutionId);
    if (!membership) {
      throw AppError.forbidden('You do not have a membership in this institution.');
    }

    const role = membership.role as Role;
    if (!ROLES.includes(role)) {
      throw AppError.forbidden();
    }

    request.institution = {
      id: membership.institution_id,
      role,
      departmentId: membership.department_id,
    };
  };

  const authorizeCapability =
    (capability: Capability): PreHandlerImpl =>
    async (request: FastifyRequest): Promise<void> => {
      await authorizeMember(request);
      if (!hasCapability(request.institution!.role, capability)) {
        throw AppError.forbidden();
      }
    };

  return {
    guard: (capability: Capability) => [authenticate, authorizeCapability(capability)],
    requireMember: [authenticate, authorizeMember],
  };
}

type PreHandlerImpl = (request: FastifyRequest) => Promise<void>;
