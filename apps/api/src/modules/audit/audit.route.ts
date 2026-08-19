import type { Capability } from '@ikp/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { FastifyPreHandler } from '../../common/auth/authorize.js';
import { AppError } from '../../common/errors.js';
import type { DbPool } from '../../infrastructure/db/db-pool.js';
import { AuditLogService } from './audit-log.service.js';

const listQuerySchema = z.object({
  actor_id: z.string().uuid().optional(),
  action: z.string().trim().max(100).optional(),
  entity_type: z.string().trim().max(100).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const READ_RATE_LIMIT = { max: 300, timeWindow: '1 minute' } as const;

export interface AuditModuleOptions {
  pool: DbPool;
  authorization: {
    guard: (capability: Capability) => FastifyPreHandler[];
  };
}

export async function registerAuditRoutes(
  app: FastifyInstance,
  options: AuditModuleOptions,
): Promise<void> {
  const service = new AuditLogService(options.pool);

  app.get(
    '/admin/audit-logs',
    {
      preHandler: options.authorization.guard('audit.read'),
      config: { rateLimit: READ_RATE_LIMIT },
    },
    async (request, reply) => {
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          'One or more fields are invalid.',
          422,
          parsed.error.flatten().fieldErrors,
        );
      }
      const { rows, total } = await service.list(
        { institutionId: request.institution!.id, userId: request.user!.id },
        {
          actorUserId: parsed.data.actor_id,
          action: parsed.data.action,
          entityType: parsed.data.entity_type,
          from: parsed.data.from ? new Date(parsed.data.from) : undefined,
          to: parsed.data.to ? new Date(parsed.data.to) : undefined,
          page: parsed.data.page,
          limit: parsed.data.limit,
        },
      );
      return reply.status(200).send({
        data: rows,
        meta: { page: parsed.data.page, limit: parsed.data.limit, total },
      });
    },
  );
}
