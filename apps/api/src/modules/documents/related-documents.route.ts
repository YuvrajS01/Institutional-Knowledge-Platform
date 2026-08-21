import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { FastifyPreHandler } from '../../common/auth/authorize.js';
import { AppError } from '../../common/errors.js';
import type { DbPool } from '../../infrastructure/db/db-pool.js';

import { RelatedDocumentsService } from './related-documents.service.js';

const paramsSchema = z.object({
  document_id: z.string().uuid(),
});

const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(20).default(5),
});

export interface RelatedDocumentsModuleOptions {
  pool: DbPool;
  authorization: {
    requireMember: FastifyPreHandler[];
  };
}

export async function registerRelatedDocumentsRoutes(
  app: FastifyInstance,
  options: RelatedDocumentsModuleOptions,
): Promise<void> {
  const service = new RelatedDocumentsService(options.pool);

  app.get(
    '/documents/:document_id/related',
    { preHandler: options.authorization.requireMember },
    async (request, reply) => {
      const parsedParams = paramsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        throw new AppError('VALIDATION_ERROR', 'One or more fields are invalid.', 422, parsedParams.error.flatten().fieldErrors);
      }
      const parsedQuery = querySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        throw new AppError('VALIDATION_ERROR', 'One or more fields are invalid.', 422, parsedQuery.error.flatten().fieldErrors);
      }
      const actor = request as unknown as { institution?: { id: string; role: string } };
      if (!actor.institution?.id) {
        throw new AppError('VALIDATION_ERROR', 'Institution context is required.', 400);
      }
      const data = await service.list(actor.institution.id, parsedParams.data.document_id, {
        limit: parsedQuery.data.limit,
        userRole: actor.institution.role,
      });
      return reply.status(200).send({ data });
    },
  );
}
