import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { FastifyPreHandler } from '../../common/auth/authorize.js';
import { AppError } from '../../common/errors.js';
import type { DbPool } from '../../infrastructure/db/db-pool.js';
import { DatesService } from './dates.service.js';

const datesQuerySchema = z.object({
  from: z.string().datetime().optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  to: z.string().datetime().optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  department_id: z.string().uuid().optional(),
  course: z.string().trim().max(200).optional(),
  semester: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export interface DatesModuleOptions {
  pool: DbPool;
  authorization: {
    requireMember: FastifyPreHandler[];
  };
}

export async function registerDatesRoutes(app: FastifyInstance, options: DatesModuleOptions): Promise<void> {
  const service = new DatesService(options.pool);

  app.get(
    '/dates',
    {
      preHandler: options.authorization.requireMember,
      config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const parsed = datesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'One or more fields are invalid.', 422, parsed.error.flatten().fieldErrors);
      }
      const actor = request as { institution?: { id: string } };
      const institutionId = actor.institution?.id;
      if (!institutionId) {
        throw new AppError('VALIDATION_ERROR', 'Missing institution context.', 400, {});
      }
      const { data, total } = await service.list(institutionId, {
        from: parsed.data.from,
        to: parsed.data.to,
        department_id: parsed.data.department_id,
        course: parsed.data.course,
        semester: parsed.data.semester,
        page: parsed.data.page,
        limit: parsed.data.limit,
      });
      return reply.status(200).send({ data, meta: { page: parsed.data.page, limit: parsed.data.limit, total } });
    },
  );
}
