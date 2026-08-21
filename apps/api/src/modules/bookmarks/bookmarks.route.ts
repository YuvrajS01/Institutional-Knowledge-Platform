import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { FastifyPreHandler } from '../../common/auth/authorize.js';
import { AppError } from '../../common/errors.js';
import type { DbPool } from '../../infrastructure/db/db-pool.js';

import { BookmarksService } from './bookmarks.service.js';

const bookmarkBodySchema = z.object({
  document_id: z.string().uuid(),
});

const bookmarkParamsSchema = z.object({
  document_id: z.string().uuid(),
});

export interface BookmarksModuleOptions {
  pool: DbPool;
  authorization: {
    requireMember: FastifyPreHandler[];
  };
}

export async function registerBookmarksRoutes(app: FastifyInstance, options: BookmarksModuleOptions): Promise<void> {
  const service = new BookmarksService(options.pool);

  app.get(
    '/bookmarks',
    { preHandler: options.authorization.requireMember },
    async (request, reply) => {
      const actor = (request as unknown as { institution?: { id: string; role: string }; user?: { id: string } });
      if (!actor.institution?.id || !actor.user?.id) {
        throw new AppError('VALIDATION_ERROR', 'Institution context is required.', 400);
      }
      const data = await service.list({
        institutionId: actor.institution.id,
        userId: actor.user!.id,
        role: actor.institution.role,
      });
      return reply.status(200).send({ data });
    },
  );

  app.post(
    '/bookmarks',
    { preHandler: options.authorization.requireMember },
    async (request, reply) => {
      const parsed = bookmarkBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'One or more fields are invalid.', 422, parsed.error.flatten().fieldErrors);
      }
      const actor = (request as unknown as { institution?: { id: string; role: string }; user?: { id: string } });
      if (!actor.institution?.id || !actor.user?.id) {
        throw new AppError('VALIDATION_ERROR', 'Institution context is required.', 400);
      }
      const data = await service.add(
        { institutionId: actor.institution.id, userId: actor.user!.id, role: actor.institution.role },
        parsed.data.document_id,
      );
      return reply.status(201).send({ data });
    },
  );

  app.delete(
    '/bookmarks/:document_id',
    { preHandler: options.authorization.requireMember },
    async (request, reply) => {
      const parsed = bookmarkParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'One or more fields are invalid.', 422, parsed.error.flatten().fieldErrors);
      }
      const actor = (request as unknown as { institution?: { id: string; role: string }; user?: { id: string } });
      if (!actor.institution?.id || !actor.user?.id) {
        throw new AppError('VALIDATION_ERROR', 'Institution context is required.', 400);
      }
      await service.remove(
        { institutionId: actor.institution.id, userId: actor.user!.id, role: actor.institution.role },
        parsed.data.document_id,
      );
      return reply.status(204).send();
    },
  );
}
