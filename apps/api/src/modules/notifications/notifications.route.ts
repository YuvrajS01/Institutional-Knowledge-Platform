import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { FastifyPreHandler } from '../../common/auth/authorize.js';
import { AppError } from '../../common/errors.js';
import type { DbPool } from '../../infrastructure/db/db-pool.js';

import { NotificationsService } from './notifications.service.js';

const paramsSchema = z.object({
  notification_id: z.string().uuid(),
});

const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  unreadOnly: z.coerce.boolean().optional(),
});

export interface NotificationsModuleOptions {
  pool: DbPool;
  authorization: {
    requireMember: FastifyPreHandler[];
  };
}

export async function registerNotificationsRoutes(
  app: FastifyInstance,
  options: NotificationsModuleOptions,
): Promise<void> {
  const service = new NotificationsService(options.pool);

  app.get(
    '/notifications',
    { preHandler: options.authorization.requireMember },
    async (request, reply) => {
      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          'One or more fields are invalid.',
          422,
          parsed.error.flatten().fieldErrors,
        );
      }
      const actor = request as unknown as { institution?: { id: string }; user?: { id: string } };
      if (!actor.institution?.id || !actor.user?.id) {
        throw new AppError('VALIDATION_ERROR', 'Institution context is required.', 400);
      }
      const data = await service.list(actor.institution.id, actor.user.id, {
        limit: parsed.data.limit,
        offset: parsed.data.offset,
        unreadOnly: parsed.data.unreadOnly,
      });
      const unreadCount = await service.countUnread(actor.institution.id, actor.user.id);
      return reply.status(200).send({ data, meta: { unread_count: unreadCount } });
    },
  );

  app.post(
    '/notifications/:notification_id/read',
    { preHandler: options.authorization.requireMember },
    async (request, reply) => {
      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          'One or more fields are invalid.',
          422,
          parsed.error.flatten().fieldErrors,
        );
      }
      const actor = request as unknown as { institution?: { id: string }; user?: { id: string } };
      if (!actor.institution?.id || !actor.user?.id) {
        throw new AppError('VALIDATION_ERROR', 'Institution context is required.', 400);
      }
      try {
        await service.markAsRead(actor.institution.id, actor.user.id, parsed.data.notification_id);
      } catch (error) {
        throw AppError.notFound((error as Error).message);
      }
      return reply.status(204).send();
    },
  );

  app.post(
    '/notifications/read-all',
    { preHandler: options.authorization.requireMember },
    async (request, reply) => {
      const actor = request as unknown as { institution?: { id: string }; user?: { id: string } };
      if (!actor.institution?.id || !actor.user?.id) {
        throw new AppError('VALIDATION_ERROR', 'Institution context is required.', 400);
      }
      const updated = await service.markAllAsRead(actor.institution.id, actor.user.id);
      return reply.status(200).send({ data: { updated } });
    },
  );
}
