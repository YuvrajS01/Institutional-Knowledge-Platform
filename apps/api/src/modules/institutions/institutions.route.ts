import type { Capability } from '@ikp/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { FastifyPreHandler } from '../../common/auth/authorize.js';
import { AppError } from '../../common/errors.js';
import type { DbPool } from '../../infrastructure/db/db-pool.js';
import { InstitutionsRepository } from './institutions.repository.js';

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    timezone: z.string().trim().min(1).max(100).optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined || value.timezone !== undefined || value.settings !== undefined,
    {
      message: 'At least one field must be provided.',
    },
  );

const READ_RATE_LIMIT = { max: 300, timeWindow: '1 minute' } as const;
const WRITE_RATE_LIMIT = { max: 60, timeWindow: '1 minute' } as const;

export interface InstitutionsModuleOptions {
  pool: DbPool;
  authorization: {
    guard: (capability: Capability) => FastifyPreHandler[];
    requireMember: FastifyPreHandler[];
  };
}

export async function registerInstitutionsRoutes(
  app: FastifyInstance,
  options: InstitutionsModuleOptions,
): Promise<void> {
  const repository = new InstitutionsRepository(options.pool);

  app.get(
    '/institutions/current',
    { preHandler: options.authorization.requireMember, config: { rateLimit: READ_RATE_LIMIT } },
    async (request, reply) => {
      const row = await repository.getById(request.institution!.id);
      if (!row) {
        throw AppError.notFound('Institution not found.');
      }
      return reply.status(200).send({ data: row });
    },
  );

  app.patch(
    '/institutions/current',
    {
      preHandler: options.authorization.guard('institutions.manage'),
      config: { rateLimit: WRITE_RATE_LIMIT },
    },
    async (request, reply) => {
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          'One or more fields are invalid.',
          422,
          parsed.error.flatten().fieldErrors,
        );
      }
      const row = await repository.update(request.institution!.id, parsed.data);
      if (!row) {
        throw AppError.notFound('Institution not found.');
      }
      return reply.status(200).send({ data: row });
    },
  );
}
