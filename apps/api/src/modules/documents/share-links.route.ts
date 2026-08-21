import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { FastifyPreHandler } from '../../common/auth/authorize.js';
import { AppError } from '../../common/errors.js';
import type { DbPool } from '../../infrastructure/db/db-pool.js';

import { ShareLinksService } from './share-links.service.js';

const paramsSchema = z.object({
  document_id: z.string().uuid(),
});

export interface ShareLinksModuleOptions {
  pool: DbPool;
  authorization: {
    requireMember: FastifyPreHandler[];
  };
}

export async function registerShareLinksRoutes(
  app: FastifyInstance,
  options: ShareLinksModuleOptions,
): Promise<void> {
  const service = new ShareLinksService(options.pool);

  app.post(
    '/documents/:document_id/share',
    { preHandler: options.authorization.requireMember },
    async (request, reply) => {
      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'One or more fields are invalid.', 422, parsed.error.flatten().fieldErrors);
      }
      const actor = request as unknown as { institution?: { id: string; role: string } };
      if (!actor.institution?.id) {
        throw new AppError('VALIDATION_ERROR', 'Institution context is required.', 400);
      }
      const result = await service.createShareLink(
        actor.institution.id,
        parsed.data.document_id,
        actor.institution.role,
      );
      if (!result) {
        throw AppError.notFound('Document not found.');
      }
      return reply.status(200).send({ data: result });
    },
  );
}
