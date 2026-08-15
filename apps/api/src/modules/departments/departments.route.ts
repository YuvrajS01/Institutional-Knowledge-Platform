import type { Capability } from '@ikp/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { FastifyPreHandler } from '../../common/auth/authorize.js';
import { AppError } from '../../common/errors.js';
import type { DbPool } from '../../infrastructure/db/db-pool.js';
import { DepartmentsRepository } from './departments.repository.js';

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  code: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .transform((value) => value.toUpperCase()),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    code: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .transform((value) => value.toUpperCase())
      .optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  })
  .refine((value) => value.name !== undefined || value.code !== undefined || value.status !== undefined, {
    message: 'At least one field must be provided.',
  });

const listQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const paramsSchema = z.object({
  department_id: z.string().uuid(),
});

const READ_RATE_LIMIT = { max: 300, timeWindow: '1 minute' } as const;
const WRITE_RATE_LIMIT = { max: 60, timeWindow: '1 minute' } as const;

export interface DepartmentsModuleOptions {
  pool: DbPool;
  authorization: {
    guard: (capability: Capability) => FastifyPreHandler[];
    requireMember: FastifyPreHandler[];
  };
}

export async function registerDepartmentsRoutes(
  app: FastifyInstance,
  options: DepartmentsModuleOptions,
): Promise<void> {
  const repository = new DepartmentsRepository(options.pool);

  app.get(
    '/departments',
    { preHandler: options.authorization.requireMember, config: { rateLimit: READ_RATE_LIMIT } },
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
      const { rows, total } = await repository.listWithTotal(request.institution!.id, {
        search: parsed.data.search,
        status: parsed.data.status,
        limit: parsed.data.limit,
        offset: (parsed.data.page - 1) * parsed.data.limit,
      });
      return reply.status(200).send({
        data: rows,
        meta: { page: parsed.data.page, limit: parsed.data.limit, total },
      });
    },
  );

  app.get(
    '/departments/:department_id',
    { preHandler: options.authorization.requireMember, config: { rateLimit: READ_RATE_LIMIT } },
    async (request, reply) => {
      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'One or more fields are invalid.', 422, {});
      }
      const row = await repository.findById(request.institution!.id, parsed.data.department_id);
      if (!row) {
        throw AppError.notFound('Department not found.');
      }
      return reply.status(200).send({ data: row });
    },
  );

  app.post(
    '/departments',
    {
      preHandler: options.authorization.guard('departments.manage'),
      config: { rateLimit: WRITE_RATE_LIMIT },
    },
    async (request, reply) => {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          'One or more fields are invalid.',
          422,
          parsed.error.flatten().fieldErrors,
        );
      }
      const row = await repository.create(request.institution!.id, parsed.data);
      return reply.status(201).send({ data: row });
    },
  );

  app.patch(
    '/departments/:department_id',
    {
      preHandler: options.authorization.guard('departments.manage'),
      config: { rateLimit: WRITE_RATE_LIMIT },
    },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) {
        throw new AppError('VALIDATION_ERROR', 'One or more fields are invalid.', 422, {});
      }
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          'One or more fields are invalid.',
          422,
          parsed.error.flatten().fieldErrors,
        );
      }
      const row = await repository.update(
        request.institution!.id,
        params.data.department_id,
        parsed.data,
      );
      if (!row) {
        throw AppError.notFound('Department not found.');
      }
      return reply.status(200).send({ data: row });
    },
  );

  app.delete(
    '/departments/:department_id',
    {
      preHandler: options.authorization.guard('departments.manage'),
      config: { rateLimit: WRITE_RATE_LIMIT },
    },
    async (request, reply) => {
      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'One or more fields are invalid.', 422, {});
      }
      const row = await repository.setStatus(
        request.institution!.id,
        parsed.data.department_id,
        'INACTIVE',
      );
      if (!row) {
        throw AppError.notFound('Department not found.');
      }
      return reply.status(204).send();
    },
  );
}
