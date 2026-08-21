import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { FastifyPreHandler } from '../../common/auth/authorize.js';
import { AppError } from '../../common/errors.js';
import type { DbPool } from '../../infrastructure/db/db-pool.js';

import { UnresolvedSearchesRepository } from './unresolved-searches.repository.js';

const unresolvedBodySchema = z.object({
  query: z.string().trim().min(1).max(500),
  context: z
    .object({
      department_id: z.string().uuid().optional(),
    })
    .optional(),
});

export interface UnresolvedSearchesModuleOptions {
  pool: DbPool;
  authorization: {
    requireMember: FastifyPreHandler[];
  };
}

export async function registerUnresolvedSearchesRoutes(
  app: FastifyInstance,
  options: UnresolvedSearchesModuleOptions,
): Promise<void> {
  const repo = new UnresolvedSearchesRepository(options.pool);

  app.post(
    '/search/unresolved',
    { preHandler: options.authorization.requireMember },
    async (request, reply) => {
      const parsed = unresolvedBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'One or more fields are invalid.', 422, parsed.error.flatten().fieldErrors);
      }
      const actor = request as unknown as { institution?: { id: string }; user?: { id: string } };
      if (!actor.institution?.id || !actor.user?.id) {
        throw new AppError('VALIDATION_ERROR', 'Institution context is required.', 400);
      }
      const data = await repo.create(actor.institution.id, actor.user.id, parsed.data.query, parsed.data.context ?? {});
      return reply.status(201).send({ data });
    },
  );
}
